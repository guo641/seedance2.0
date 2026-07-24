import { requireKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { createTask } from '@/lib/tasks';
import { makeSubtitle } from '@/lib/pipeline';
import { resolveDouyin } from '@/lib/douyin';
import { resolveVideoInput } from '@/lib/media';

// 触发字幕生成 → 返回 taskId,前端轮询 /api/generate-subtitle/status
export async function POST(req: Request) {
  let s;
  try {
    s = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const body = await req.json().catch(() => ({}));
  const { video_url, douyin_url } = body;

  const taskId = runWithKey({ apiKey: s.apiKey, baseUrl: s.baseUrl }, () =>
    createTask('subtitle', async (t) => {
    let src = video_url as string | undefined;
    if (!src && douyin_url) {
      t.progress = '解析抖音链接...';
      const r = await resolveDouyin(douyin_url);
      if (!r.ok || !r.videoUrl) throw new Error(r.error || '抖音解析失败');
      src = r.videoUrl;
    }
    if (!src) throw new Error('缺少 video_url 或 douyin_url');
    t.progress = '转写字幕中...';
    const subtitle = await makeSubtitle(resolveVideoInput(src));
    return { subtitle, final_video_url: src, subtitle_url: null };
    }),
  );

  return Response.json({ success: true, taskId });
}
