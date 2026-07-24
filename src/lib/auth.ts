import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-insecure-secret');
const COOKIE = 'auth_token';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export type KeySession = { apiKey: string; baseUrl?: string; ownerId: string };

/** 由 key 派生稳定的匿名身份(用于按 key 隔离数据) */
export function keyHash(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 24);
}

export async function setKeySession(apiKey: string, baseUrl?: string) {
  const token = await new SignJWT({ apiKey, baseUrl })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
  // 桌面版跑在 http://127.0.0.1:随机端口:secure:true + sameSite:none 在 http 下易被丢弃,
  // 导致重启后会话丢失、又要重输秘钥。应用始终同源,用 lax + 非 secure 最稳,能可靠持久化 30 天。
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, '', { path: '/', maxAge: 0 });
}

export async function getKeySession(): Promise<KeySession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const apiKey = payload.apiKey as string;
    if (!apiKey) return null;
    return { apiKey, baseUrl: payload.baseUrl as string | undefined, ownerId: keyHash(apiKey) };
  } catch {
    return null;
  }
}

/** 打码显示 key */
export function maskKey(k: string): string {
  if (k.length <= 10) return k.slice(0, 3) + '***';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
