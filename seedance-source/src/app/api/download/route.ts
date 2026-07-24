import { requireKey } from '@/lib/api';

// 视频下载代理:服务端拉取直链并以附件形式流回浏览器(绕过跨域/防盗链,强制下载)
export async function GET(req: Request) {
  try {
    await requireKey();
  } catch (r) {
    return r as Response;
  }
  const sp = new URL(req.url).searchParams;
  const url = sp.get('url');
  const name = (sp.get('name') || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp4';
  if (!url) return Response.json({ success: false, error: '缺少 url' }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.douyin.com/' },
    });
  } catch (e: any) {
    return Response.json({ success: false, error: `下载失败: ${e?.message || e}` }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body)
    return Response.json({ success: false, error: `下载失败 HTTP ${upstream.status}` }, { status: 502 });

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(upstream.body, { headers });
}
