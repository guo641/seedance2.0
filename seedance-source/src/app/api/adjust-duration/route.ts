import { currentKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { createTask } from '@/lib/tasks';
import { adjustDuration } from '@/lib/pipeline';
import { ADJUST_INSTRUCTIONS, ADJUST_LABELS, type AdjustKey } from '@/lib/prompts';
import { DEFAULT_MODEL } from '@/lib/models';

// 触发时长调整 → taskId
export async function POST(req: Request) {
  const u = await currentKey();
  if (!u) return Response.json({ success: false, error: '请先输入你的秘钥' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    storyboard_text,
    adjust_key,
    adjust_instruction,
    segment_duration,
    model = DEFAULT_MODEL,
  } = body;
  const key = adjust_key as AdjustKey;

  if (!storyboard_text) return Response.json({ success: false, error: '缺少分镜文本' }, { status: 400 });
  if (!key || !ADJUST_INSTRUCTIONS[key])
    return Response.json({ success: false, error: '未知的时长调整档位' }, { status: 400 });

  const seg = Number(segment_duration) || undefined; // 未传则由 pipeline 从文本自动识别
  const taskId = runWithKey({ apiKey: u.apiKey, baseUrl: u.baseUrl }, () =>
    createTask('adjust', async (t) => {
      t.progress = `${ADJUST_LABELS[key]}...`;
      const result = await adjustDuration(storyboard_text, key, model, seg);
      if (!result?.trim()) throw new Error('时长调整结果为空');
      return { result, adjust_key: key, model };
    }),
  );

  return Response.json({ success: true, taskId, instruction: adjust_instruction });
}

// 供前端拉取档位列表
export async function GET() {
  const options = (Object.keys(ADJUST_LABELS) as AdjustKey[]).map((k) => ({
    key: k,
    label: ADJUST_LABELS[k],
    group: k.startsWith('shorten') ? 'shorten' : 'extend',
  }));
  return Response.json({ success: true, data: options });
}
