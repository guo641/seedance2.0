import { getTask } from '@/lib/tasks';

// 分镜反推状态轮询(analyze-storyboard/status 亦复用此逻辑)
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('taskId') || '';
  const t = getTask(id);
  if (!t) return Response.json({ success: false, status: 'failed', error: '任务不存在' });
  return Response.json({
    success: t.status !== 'failed',
    status: t.status,
    progress: t.progress,
    error: t.error,
    storyboardTaskId: t.id,
    result: t.status === 'success' ? t.result?.storyboard : undefined,
    ...(t.status === 'success' ? t.result : {}),
  });
}
