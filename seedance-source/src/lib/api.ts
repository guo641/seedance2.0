import { NextResponse } from 'next/server';
import { getKeySession, type KeySession } from './auth';

export function ok(data: any = {}, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: true, data, ...extra });
}
export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message, message }, { status });
}

/** 当前会话(BYOK):返回 { apiKey, baseUrl, ownerId } 或 null */
export async function currentKey(): Promise<KeySession | null> {
  return getKeySession();
}

/** 要求已连接 key,否则抛出 401 响应 */
export async function requireKey(): Promise<KeySession> {
  const s = await getKeySession();
  if (!s) throw fail('请先输入你的秘钥并验证', 401);
  return s;
}
