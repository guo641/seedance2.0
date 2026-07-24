import { getTask } from '@/lib/tasks';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('taskId') || '';
  const t = getTask(id);
  if (!t) return Response.json({ success: false, status: 'failed', error: '任务不存在' });
  return Response.json({
    success: t.status !== 'failed',
    status: t.status,
    progress: t.progress,
    error: t.error,
    srt: t.status === 'success' ? t.result?.srt : undefined,
    text: t.status === 'success' ? t.result?.text : undefined,
    lineCount: t.status === 'success' ? t.result?.lineCount : undefined,
  });
}
