import { resolveDouyin } from '@/lib/douyin';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const url = sp.get('url') || '';
  const platform = (sp.get('platform') || 'douyin') as any;
  if (!url) return Response.json({ success: false, error: '缺少 url 参数' }, { status: 400 });
  const r = await resolveDouyin(url, platform);
  if (!r.ok) return Response.json({ success: false, error: r.error });
  return Response.json({ success: true, data: { videoUrl: r.videoUrl, title: r.title, cover: r.cover } });
}
