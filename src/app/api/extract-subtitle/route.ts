import { requireKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { createTask } from '@/lib/tasks';
import { extractSubtitle } from '@/lib/pipeline';
import { resolveDouyin } from '@/lib/douyin';
import { resolveVideoInput } from '@/lib/media';

// 一键提取文案字幕:输入分享链接 或 已解析直链/上传地址 → 免费必剪转写
export async function POST(req: Request) {
  let s;
  try {
    s = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const body = await req.json().catch(() => ({}));
  const { url, video_url, platform } = body;
  if (!url && !video_url)
    return Response.json({ success: false, error: '需要 url(分享链接)或 video_url(直链)' }, { status: 400 });

  const taskId = runWithKey({ apiKey: s.apiKey, baseUrl: s.baseUrl }, () =>
    createTask('subtitle', async (t) => {
    let src = video_url as string | undefined;
    if (!src && url) {
      t.progress = '解析链接...';
      const r = await resolveDouyin(url, platform || 'douyin');
      if (!r.ok || !r.videoUrl) throw new Error(r.error || '解析失败');
      src = r.videoUrl;
    }
    if (!src) throw new Error('缺少视频地址');
    const out = await extractSubtitle(resolveVideoInput(src), (m) => (t.progress = m));
    return { srt: out.srt, text: out.text, lineCount: out.cues.length };
    }),
  );

  return Response.json({ success: true, taskId });
}
