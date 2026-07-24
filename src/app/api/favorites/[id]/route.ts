import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

// 取消收藏
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const { id } = await ctx.params;
  db.prepare('UPDATE analyses SET favorite = 0 WHERE id = ? AND owner_id = ?').run(Number(id), u.ownerId);
  return Response.json({ success: true });
}
