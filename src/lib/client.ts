'use client';

export async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // 服务器返回了非 JSON(通常是 HTML 错误页):给出可读的报错,而不是 "Unexpected token '<'"
    const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`服务器返回异常(HTTP ${res.status})${snippet ? ':' + snippet : ',请稍后重试'}`);
  }
}

export async function postJSON<T = any>(url: string, body: any): Promise<T> {
  return api<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 触发任务后轮询 status,直到 success/failed */
export async function pollTask(
  statusUrl: (taskId: string) => string,
  taskId: string,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (s: any) => void } = {},
): Promise<any> {
  const interval = opts.intervalMs ?? 2500;
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await api(statusUrl(taskId));
    opts.onTick?.(s);
    if (s.status === 'success') return s;
    if (s.status === 'failed') throw new Error(s.error || '任务失败');
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('任务超时');
}
