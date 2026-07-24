import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

function row2card(r: any) {
  return {
    id: r.id,
    folderId: r.folder_id,
    mode: r.mode,
    model: r.model,
    videoUrl: r.video_url,
    sourceUrl: r.source_url,
    subtitleUrl: r.subtitle_url,
    segmentSeconds: r.segment_seconds,
    storyboard: r.storyboard,
    title: r.title,
    tags: r.tags ? JSON.parse(r.tags) : [],
    summary: r.summary,
    favorite: r.favorite === 1,
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
  const folderId = sp.get('folderId');

  if (id) {
    const r = db
      .prepare('SELECT * FROM analyses WHERE id = ? AND owner_id = ?')
      .get(Number(id), u.ownerId);
    if (!r) return Response.json({ success: false, error: '记录不存在' }, { status: 404 });
    return Response.json({ success: true, data: row2card(r) });
  }

  let rows;
  if (!folderId || folderId === 'all') {
    rows = db
      .prepare('SELECT * FROM analyses WHERE owner_id = ? ORDER BY created_at DESC')
      .all(u.ownerId);
  } else {
    rows = db
      .prepare('SELECT * FROM analyses WHERE owner_id = ? AND folder_id = ? ORDER BY created_at DESC')
      .all(u.ownerId, Number(folderId));
  }
  return Response.json({ success: true, data: rows.map(row2card) });
}

// 保存分镜结果到历史库
export async function POST(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  if (!b.storyboard) return Response.json({ success: false, error: '缺少 storyboard' }, { status: 400 });
  const info = db
    .prepare(
      `INSERT INTO analyses (owner_id, folder_id, mode, model, source_url, video_url, subtitle_url, segment_seconds, storyboard, title, tags, summary, favorite, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
    )
    .run(
      u.ownerId,
      b.folderId ?? null,
      b.mode || 'douyin',
      b.model ?? null,
      b.sourceUrl ?? null,
      b.videoUrl ?? null,
      b.subtitleUrl ?? null,
      b.segmentSeconds ?? 12,
      b.storyboard,
      b.title ?? null,
      b.tags ? JSON.stringify(b.tags) : null,
      b.summary ?? null,
      Date.now(),
    );
  return Response.json({ success: true, data: { id: info.lastInsertRowid } });
}

// 编辑分镜内容 / 移动文件夹 / 改标题
export async function PUT(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ success: false, error: '缺少 id' }, { status: 400 });
  const owned = db
    .prepare('SELECT id FROM analyses WHERE id = ? AND owner_id = ?')
    .get(b.id, u.ownerId);
  if (!owned) return Response.json({ success: false, error: '无权限' }, { status: 403 });

  const fields: string[] = [];
  const vals: any[] = [];
  if (b.storyboard !== undefined) (fields.push('storyboard = ?'), vals.push(b.storyboard));
  if (b.folderId !== undefined) (fields.push('folder_id = ?'), vals.push(b.folderId));
  if (b.title !== undefined) (fields.push('title = ?'), vals.push(b.title));
  if (b.tags !== undefined) (fields.push('tags = ?'), vals.push(JSON.stringify(b.tags)));
  if (b.summary !== undefined) (fields.push('summary = ?'), vals.push(b.summary));
  if (b.favorite !== undefined) (fields.push('favorite = ?'), vals.push(b.favorite ? 1 : 0));
  if (!fields.length) return Response.json({ success: true, data: {} });
  vals.push(b.id);
  db.prepare(`UPDATE analyses SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return Response.json({ success: true, data: {} });
}

export async function DELETE(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ success: false, error: '缺少 id' }, { status: 400 });
  db.prepare('DELETE FROM analyses WHERE id = ? AND owner_id = ?').run(Number(id), u.ownerId);
  return Response.json({ success: true });
}
