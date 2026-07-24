import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

function row2p(r: any) {
  return {
    id: r.id,
    folderId: r.folder_id,
    variantOf: r.variant_of,
    name: r.name,
    content: r.content,
    meta: r.meta ? JSON.parse(r.meta) : null,
    createdAt: r.created_at,
  };
}

export async function GET(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id');
  const variantOf = sp.get('variantOf');
  const folderId = sp.get('folderId');

  if (id) {
    const r = db.prepare('SELECT * FROM prompts WHERE id = ? AND owner_id = ?').get(Number(id), u.ownerId);
    return r
      ? Response.json({ success: true, data: row2p(r) })
      : Response.json({ success: false, error: '不存在' }, { status: 404 });
  }
  if (variantOf) {
    const rows = db
      .prepare('SELECT * FROM prompts WHERE owner_id = ? AND variant_of = ? ORDER BY created_at ASC')
      .all(u.ownerId, Number(variantOf));
    return Response.json({ success: true, data: rows.map(row2p) });
  }
  let rows;
  if (!folderId || folderId === 'all') {
    rows = db
      .prepare('SELECT * FROM prompts WHERE owner_id = ? AND variant_of IS NULL ORDER BY created_at DESC')
      .all(u.ownerId);
  } else {
    rows = db
      .prepare('SELECT * FROM prompts WHERE owner_id = ? AND folder_id = ? AND variant_of IS NULL ORDER BY created_at DESC')
      .all(u.ownerId, Number(folderId));
  }
  return Response.json({ success: true, data: rows.map(row2p) });
}

// 新建提示词(TXT 生成结果 / 手动保存)
export async function POST(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  if (!b.content) return Response.json({ success: false, error: '缺少 content' }, { status: 400 });
  const info = db
    .prepare(
      'INSERT INTO prompts (owner_id, folder_id, variant_of, name, content, meta, created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      u.ownerId,
      b.folderId ?? null,
      b.variantOf ?? null,
      b.name ?? '视频分镜提示词',
      b.content,
      b.meta ? JSON.stringify(b.meta) : null,
      Date.now(),
    );
  return Response.json({ success: true, data: { id: info.lastInsertRowid } });
}

export async function PUT(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  const owned = db.prepare('SELECT id FROM prompts WHERE id = ? AND owner_id = ?').get(b.id, u.ownerId);
  if (!owned) return Response.json({ success: false, error: '仅作者可修改' }, { status: 403 });
  const fields: string[] = [];
  const vals: any[] = [];
  if (b.content !== undefined) (fields.push('content = ?'), vals.push(b.content));
  if (b.name !== undefined) (fields.push('name = ?'), vals.push(b.name));
  if (b.folderId !== undefined) (fields.push('folder_id = ?'), vals.push(b.folderId));
  if (fields.length) {
    vals.push(b.id);
    db.prepare(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  return Response.json({ success: true });
}

// 删除(级联删除变体由外键 ON DELETE CASCADE 处理)
export async function DELETE(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const id = Number(new URL(req.url).searchParams.get('id'));
  db.prepare('DELETE FROM prompts WHERE id = ? AND owner_id = ?').run(id, u.ownerId);
  return Response.json({ success: true });
}
