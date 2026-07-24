import { AsyncLocalStorage } from 'node:async_hooks';

/** 每个请求/任务携带的用户 key 上下文(BYOK)。 */
export type KeyCtx = { apiKey: string; baseUrl?: string };

export const keyStore = new AsyncLocalStorage<KeyCtx>();

export function getKeyCtx(): KeyCtx | undefined {
  return keyStore.getStore();
}

/**
 * 在 key 上下文中运行 fn。因为 createTask 会在同步阶段启动异步任务,
 * 在 run() 内启动的异步链会继承这个上下文,任务全程都能读到 key。
 */
export function runWithKey<T>(ctx: KeyCtx, fn: () => T): T {
  return keyStore.run(ctx, fn);
}
