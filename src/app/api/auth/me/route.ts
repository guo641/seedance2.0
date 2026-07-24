import { getKeySession, maskKey } from '@/lib/auth';

export async function GET() {
  const s = await getKeySession();
  if (!s) return Response.json({ connected: false });
  return Response.json({ connected: true, keyMask: maskKey(s.apiKey) });
}
