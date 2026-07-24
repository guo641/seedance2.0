import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';
import { nanoid } from 'nanoid';

/**
 * 二维码分享:把一段 TXT 内容存成 30 分钟有效的临时分享,返回二维码 DataURL。
 * 手机扫码打开 /share/<token> 预览 TXT。
 */
const g = globalThis as unknown as { __shares?: Map<string, { text: string; exp: number }> };
const shares = g.__shares ?? (g.__shares = new Map());

export async function POST(req: Request) {
  try {
    await requireKey();
  } catch (r) {
    return r as Response;
  }
  const { text, origin } = await req.json().catch(() => ({}));
  if (!text) return Response.json({ success: false, error: '缺少内容' }, { status: 400 });

  const token = nanoid(12);
  shares.set(token, { text, exp: Date.now() + 30 * 60 * 1000 });
  const base = origin || new URL(req.url).origin;
  const shareUrl = `${base}/share/${token}`;
  try {
    const dataUrl = await QRCode.toDataURL(shareUrl, { width: 320, margin: 1 });
    return Response.json({ success: true, data: { qr: dataUrl, url: shareUrl, ttlMinutes: 30 } });
  } catch {
    return Response.json({ success: false, error: '生成二维码失败' });
  }
}

// 分享页读取
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const s = shares.get(token);
  if (!s || s.exp < Date.now()) return Response.json({ success: false, error: '链接已失效' }, { status: 410 });
  return Response.json({ success: true, data: { text: s.text } });
}
