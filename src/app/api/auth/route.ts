import { setKeySession } from '@/lib/auth';
import { yunwu } from '@/lib/yunwu';

// BYOK 登录:输入 yunwu key → 验证(拉一次 /models)→ 成功则写会话
export async function POST(req: Request) {
  const { key, baseUrl } = await req.json().catch(() => ({}));
  const apiKey = (key || '').trim();
  if (!apiKey) return Response.json({ success: false, message: '请输入秘钥' }, { status: 400 });

  try {
    const client = yunwu(apiKey, baseUrl);
    // 轻量验证:能列出模型即视为 key 有效
    const list = await client.models.list();
    const count = (list as any)?.data?.length ?? 0;
    if (!count) throw new Error('该 key 无法列出模型');
    await setKeySession(apiKey, baseUrl || undefined);
    return Response.json({ success: true, modelCount: count });
  } catch (e: any) {
    const msg = String(e?.message || e);
    // 解开 OpenAI SDK 的 "Connection error." 兜底,暴露真实根因(ECONNREFUSED/ENOTFOUND/fetch failed...)
    let detail = msg;
    let isNet = false;
    if (/connection error/i.test(msg)) {
      const cause = e?.cause || e?.error?.cause;
      detail = cause ? String(cause?.message || cause) : msg + ' (无 cause 链)';
      isNet = true;
    }
    if (isNet) {
      return Response.json({
        success: false,
        message: `网络请求失败: ${detail}`,
        netError: true,
        hint: '请检查:①浏览器打开 https://yunwu.ai 是否正常 ②是否开了代理/VPN/Clash TUN(可能劫持 Node TLS 握手)③防火墙是否拦截',
      }, { status: 502 });
    }
    const friendly = /401|invalid|无效|令牌|unauthor/i.test(msg)
      ? 'Key 无效或未授权'
      : `验证失败: ${msg}`;
    return Response.json({ success: false, message: friendly }, { status: 401 });
  }
}
