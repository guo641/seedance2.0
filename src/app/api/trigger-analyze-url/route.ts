import { currentKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { createTask } from '@/lib/tasks';
import { reverseStoryboard, reverseFromCommentary } from '@/lib/pipeline';
import { resolveVideoInput } from '@/lib/media';
import { SEGMENT_SECONDS } from '@/lib/prompts';

// 触发 Seedance 2.0 分镜反推 → 返回 taskId
export async function POST(req: Request) {
  const u = await currentKey();
  if (!u) return Response.json({ success: false, error: '请先输入你的秘钥' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    video_url,
    subtitle,
    commentary, // 电影解说文案(纯文本反推)
    commentary_total, // 解说文案已知总时长(可选)
    model,
    segment_duration = SEGMENT_SECONDS,
    style = '',
    prompt_description = '',
  } = body;

  if (!video_url && !subtitle && !commentary?.trim())
    return Response.json({ success: false, error: '无效的输入(需视频/字幕/解说文案)' }, { status: 400 });

  const userId = u.ownerId;
  const seg = Number(segment_duration) || SEGMENT_SECONDS;
  // 在 key 上下文中启动任务,任务内的 yunwu 调用会用当前用户的 key
  const taskId = runWithKey({ apiKey: u.apiKey, baseUrl: u.baseUrl }, () =>
    createTask('analyze', async (t) => {
    // 电影解说文案 → 画面提示词
    if (commentary?.trim()) {
      t.progress = '解析解说文案、反推画面中...';
      const { storyboard } = await reverseFromCommentary({
        script: commentary,
        modelId: model,
        segmentSeconds: seg,
        totalSeconds: Number(commentary_total) || undefined,
        style,
        onProgress: (m) => (t.progress = m),
      });
      return { storyboard, model, segment_duration, mode: 'commentary', _ownerId: userId };
    }

    // 视频/字幕 → 分镜
    t.progress = '反推分镜中...';
    const { storyboard, usedFrames, durationSec } = await reverseStoryboard({
      videoPathOrUrl: video_url ? resolveVideoInput(video_url) : undefined,
      subtitle,
      modelId: model,
      segmentSeconds: seg,
      style,
      onProgress: (m) => (t.progress = m),
    });
    return {
      storyboard,
      usedFrames,
      durationSec,
      model,
      segment_duration,
      video_url,
      _ownerId: userId,
      prompt_description,
    };
    }),
  );

  return Response.json({ success: true, taskId });
}
