/**
 * 抖音/多平台 分享链接 → 无水印视频直链解析。
 *
 * 1.0.9 起改多源降级:按 PARSERS 顺序逐个尝试,第一个成功就返回。
 *   旧版依赖单点 api.bugpk.com 在 2026-08 挂掉(Cloudflare 风控),导致整条链路瘫痪。
 *   现有源:
 *     - xcboke  https://api.xcboke.cn/api/dy   (抖音主用,实测可用)
 *     - bugpk   https://api.bugpk.com/api/douyin (旧主用,目前已挂,作为兜底)
 *   任意解析服务返回 { code:200, data:{ url, title, cover, ... } } 即可。
 *   解析响应支持 {data:{url|video|play}} 取第一个非空。
 *
 * 可用环境变量覆盖/追加:
 *   DOUYIN_PARSERS  —— 逗号分隔的 base URL 列表,优先级从左到右
 */

type Provider = {
  base: string; // 域名,不含 path
  endpoint: string; // path
  platform: string; // 平台名
};

const DEFAULT_PARSERS: Record<string, Provider> = {
  // 抖音:多源降级
  douyin: { base: 'https://api.xcboke.cn', endpoint: '/api/dy', platform: 'douyin' },
  // 其它平台:xcboke 暂不支持,所以继续走旧的 bugpk 接口(等挂了再加新源)
  kuaishou: { base: 'https://api.bugpk.com', endpoint: '/api/ksjx', platform: 'kuaishou' },
  bilibili: { base: 'https://api.bugpk.com', endpoint: '/api/bilibili', platform: 'bilibili' },
  xhs: { base: 'https://api.bugpk.com', endpoint: '/api/xhsjx', platform: 'xhs' },
  toutiao: { base: 'https://api.bugpk.com', endpoint: '/api/toutiao', platform: 'toutiao' },
};

// 用户可自定义 DOUYIN_PARSERS 覆盖;逗号分隔,只为 douyin 平台多源降级生效
//   DOUYIN_PARSERS=https://api.xcboke.cn,https://api.bugpk.com
function getDouyinBases(): string[] {
  const env = process.env.DOUYIN_PARSERS?.trim();
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  return [DEFAULT_PARSERS.douyin.base, 'https://api.bugpk.com']; // 顺序:新主用 → 老备用
}

const URL_RE = /https?:\/\/[^\s"'<>，。]+/;

export function extractShareUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0] : text.trim() || null;
}

async function callOneProvider(
  base: string,
  endpoint: string,
  share: string,
): Promise<{ ok: true; videoUrl: string; title?: string; cover?: string } | { ok: false; error: string; tried: string }> {
  const api = `${base}${endpoint}?url=${encodeURIComponent(share)}`;
  try {
    const res = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      // 解析服务偶尔较慢
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, tried: `${base}${endpoint}` };
    const json: any = await res.json().catch(() => null);
    if (!json) return { ok: false, error: '响应非 JSON', tried: `${base}${endpoint}` };
    if (json.code !== 200) return { ok: false, error: json.msg || `code=${json.code}`, tried: `${base}${endpoint}` };

    const data = json.data || {};
    const videoUrl: string | undefined = data.url || data.video || data.play;
    if (!videoUrl) {
      if (Array.isArray(data.images) && data.images.length)
        return { ok: false, error: '该链接为图文/图集,无视频可反推', tried: `${base}${endpoint}` };
      return { ok: false, error: '未获取到视频直链', tried: `${base}${endpoint}` };
    }
    return { ok: true, videoUrl, title: data.title, cover: data.cover || data.coverUrl };
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? '超时' : e?.message || String(e);
    return { ok: false, error: msg, tried: `${base}${endpoint}` };
  }
}

export async function resolveDouyin(
  input: string,
  platform: keyof typeof DEFAULT_PARSERS = 'douyin',
): Promise<{ ok: boolean; videoUrl?: string; title?: string; cover?: string; error?: string; tried?: string[] }> {
  const share = extractShareUrl(input);
  if (!share) return { ok: false, error: '未识别到视频链接' };

  // 抖音走多源降级;其它平台暂时单源(没找到稳定的多源)
  if (platform === 'douyin') {
    const bases = getDouyinBases();
    const tried: string[] = [];
    const errors: string[] = [];
    for (const base of bases) {
      const r = await callOneProvider(base, '/api/dy', share);
      tried.push(r.tried);
      if (r.ok) return { ok: true, videoUrl: r.videoUrl, title: r.title, cover: r.cover, tried };
      errors.push(`${r.tried}: ${r.error}`);
    }
    return {
      ok: false,
      error: `所有解析源都失败(${errors.join(' | ')})。请稍后重试,或在 .env 设置 DOUYIN_PARSERS 指定其它服务。`,
      tried,
    };
  }

  // 非抖音平台:用对应 provider 单源
  const p = DEFAULT_PARSERS[platform] || DEFAULT_PARSERS.douyin;
  const r = await callOneProvider(p.base, p.endpoint, share);
  if (r.ok) return { ok: true, videoUrl: r.videoUrl, title: r.title, cover: r.cover, tried: [r.tried] };
  return { ok: false, error: `解析失败: ${r.error}`, tried: [r.tried] };
}
