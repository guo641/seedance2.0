import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

// 收藏列表(原程序对普通会员可能受限;此处放开给已登录用户)
export async function GET() {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const rows = db
    .prepare('SELECT * FROM analyses WHERE owner_id = ? AND favorite = 1 ORDER BY created_at DESC')
    .all(u.ownerId);
  return Response.json({
    success: true,
    data: rows.map((r: any) => ({ id: r.id, title: r.title, storyboard: r.storyboard, createdAt: r.created_at })),
  });
}

// 收藏(body: {id})
export async function POST(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const { id } = await req.json().catch(() => ({}));
  db.prepare('UPDATE analyses SET favorite = 1 WHERE id = ? AND owner_id = ?').run(id, u.ownerId);
  return Response.json({ success: true });
}
