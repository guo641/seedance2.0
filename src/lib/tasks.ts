import { nanoid } from 'nanoid';

/**
 * 轻量异步任务存储 —— 复刻原程序「触发返回 taskId + 轮询 status」的模型。
 * 生产环境可换成 Redis / DB;此处用进程内 Map(单实例够用)。
 */
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export type Task = {
  id: string;
  kind: 'subtitle' | 'analyze' | 'adjust' | 'variant';
  status: TaskStatus;
  progress?: string;
  result?: any;
  error?: string;
  createdAt: number;
};

const g = globalThis as unknown as { __tasks?: Map<string, Task> };
const tasks = g.__tasks ?? (g.__tasks = new Map<string, Task>());

export function createTask(kind: Task['kind'], run: (t: Task) => Promise<any>): string {
  const id = nanoid(16);
  const task: Task = { id, kind, status: 'pending', createdAt: Date.now() };
  tasks.set(id, task);
  // 异步执行,不阻塞请求
  (async () => {
    task.status = 'running';
    try {
      task.result = await run(task);
      task.status = 'success';
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
    }
  })();
  return id;
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

// 每小时清理老任务
const gc = globalThis as unknown as { __taskGc?: boolean };
if (!gc.__taskGc) {
  gc.__taskGc = true;
  setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, t] of tasks) if (t.createdAt < cutoff) tasks.delete(id);
  }, 10 * 60 * 1000).unref?.();
}
