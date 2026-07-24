import { currentKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { createTask, getTask } from '@/lib/tasks';
import { generateVariant } from '@/lib/pipeline';
import { DEFAULT_MODEL } from '@/lib/models';
import type { VariantDims } from '@/lib/prompts';

// 触发变体生成 → taskId
export async function POST(req: Request) {
  const u = await currentKey();
  if (!u) return Response.json({ success: false, error: '请先输入你的秘钥' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { source, dims, model = DEFAULT_MODEL } = b as {
    source: string;
    dims: VariantDims;
    model?: string;
  };
  if (!source) return Response.json({ success: false, error: '缺少原始提示词' }, { status: 400 });
  if (!dims || Object.keys(dims).length === 0)
    return Response.json({ success: false, error: '请至少选择一个改写维度' }, { status: 400 });

  const taskId = runWithKey({ apiKey: u.apiKey, baseUrl: u.baseUrl }, () =>
    createTask('variant', async (t) => {
      t.progress = '生成变体中...';
      const content = await generateVariant(source, dims, model);
      if (!content?.trim()) throw new Error('变体生成失败,请重试');
      return { content };
    }),
  );
  return Response.json({ success: true, taskId });
}

// 轮询变体状态
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('taskId') || '';
  const t = getTask(id);
  if (!t) return Response.json({ success: false, status: 'failed', error: '任务不存在' });
  return Response.json({
    success: t.status !== 'failed',
    status: t.status,
    error: t.error,
    content: t.status === 'success' ? t.result?.content : undefined,
  });
}
