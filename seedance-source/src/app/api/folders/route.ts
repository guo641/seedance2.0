import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

function row2f(r: any) {
  return { id: r.id, kind: r.kind, name: r.name, icon: r.icon, pinned: r.pinned === 1, sort: r.sort };
}

export async function GET(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const kind = new URL(req.url).searchParams.get('kind') || 'analysis';
  const rows = db
    .prepare('SELECT * FROM folders WHERE owner_id = ? AND kind = ? ORDER BY pinned DESC, sort ASC, created_at DESC')
    .all(u.ownerId, kind);
  return Response.json({ success: true, data: rows.map(row2f) });
}

export async function POST(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  if (!b.name || String(b.name).length > 20)
    return Response.json({ success: false, error: '文件夹名称不能超过20个字符' }, { status: 400 });
  const info = db
    .prepare('INSERT INTO folders (owner_id, kind, name, icon, pinned, sort, created_at) VALUES (?,?,?,?,0,0,?)')
    .run(u.ownerId, b.kind || 'analysis', b.name, b.icon ?? null, Date.now());
  return Response.json({ success: true, data: { id: info.lastInsertRowid } });
}

// 重命名 / 改图标 / 置顶(?id=&action=pin|unpin)
export async function PUT(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get('id'));
  const action = sp.get('action');
  const owned = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?').get(id, u.ownerId);
  if (!owned) return Response.json({ success: false, error: '仅作者可修改' }, { status: 403 });

  if (action === 'pin' || action === 'unpin') {
    db.prepare('UPDATE folders SET pinned = ? WHERE id = ?').run(action === 'pin' ? 1 : 0, id);
    return Response.json({ success: true });
  }
  const b = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const vals: any[] = [];
  if (b.name !== undefined) (fields.push('name = ?'), vals.push(b.name));
  if (b.icon !== undefined) (fields.push('icon = ?'), vals.push(b.icon));
  if (b.sort !== undefined) (fields.push('sort = ?'), vals.push(b.sort));
  if (fields.length) {
    vals.push(id);
    db.prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const id = Number(new URL(req.url).searchParams.get('id'));
  db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').run(id, u.ownerId);
  return Response.json({ success: true });
}
