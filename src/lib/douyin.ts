/**
 * 抖音/多平台 分享链接 → 无水印视频直链解析。
 *
 * 使用 shuiying.nxux.cn 背后的解析服务 api.bugpk.com。
 *   GET {BASE}/api/douyin?url=<分享链接>
 *   → { code:200, msg, data:{ title, author, url, cover, images[], music, ... } }
 *   data.url = 无水印视频直链;data.images = 图集(图文类,非视频)。
 *
 * 可用 DOUYIN_API_BASE 覆盖 base;PLATFORM 端点见 PLATFORM_ENDPOINT。
 */

const BASE = process.env.DOUYIN_API_BASE || 'https://api.bugpk.com';

const PLATFORM_ENDPOINT: Record<string, string> = {
  all: '/api/short_videos', // 通用(自动识别平台)
  douyin: '/api/douyin',
  kuaishou: '/api/ksjx',
  bilibili: '/api/bilibili',
  xhs: '/api/xhsjx',
  toutiao: '/api/toutiao',
};

const URL_RE = /https?:\/\/[^\s"'<>，。]+/;

export function extractShareUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0] : text.trim() || null;
}

export async function resolveDouyin(
  input: string,
  platform: keyof typeof PLATFORM_ENDPOINT = 'douyin',
): Promise<{ ok: boolean; videoUrl?: string; title?: string; cover?: string; error?: string }> {
  const share = extractShareUrl(input);
  if (!share) return { ok: false, error: '未识别到视频链接' };

  const endpoint = PLATFORM_ENDPOINT[platform] || PLATFORM_ENDPOINT.douyin;
  const api = `${BASE}${endpoint}?url=${encodeURIComponent(share)}`;

  try {
    const res = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      // 解析服务偶尔较慢
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, error: `解析服务 HTTP ${res.status}` };
    const json: any = await res.json().catch(() => null);
    if (!json) return { ok: false, error: '解析响应无法解析' };
    if (json.code !== 200) return { ok: false, error: json.msg || '解析失败,请稍后再试' };

    const data = json.data || {};
    const videoUrl: string | undefined = data.url || data.video || data.play;
    if (!videoUrl) {
      if (Array.isArray(data.images) && data.images.length)
        return { ok: false, error: '该链接为图文/图集,无视频可反推' };
      return { ok: false, error: '未获取到视频直链' };
    }
    return { ok: true, videoUrl, title: data.title, cover: data.cover || data.coverUrl };
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? '解析超时,请重试' : e?.message || String(e);
    return { ok: false, error: `解析失败: ${msg}` };
  }
}
