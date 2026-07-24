import { db } from '@/lib/db';
import { requireKey } from '@/lib/api';

/**
 * 跨库/跨文件夹 移动或复制。
 * body: { type: 'analysis'|'prompt', id, targetFolderId, action: 'move'|'copy' }
 * 支持「复制到提示词工坊」(analysis → prompt)。
 */
export async function POST(req: Request) {
  let u;
  try {
    u = await requireKey();
  } catch (r) {
    return r as Response;
  }
  const b = await req.json().catch(() => ({}));
  const { type, id, targetFolderId, action = 'move', toWorkshop } = b;

  if (type === 'analysis') {
    const r: any = db.prepare('SELECT * FROM analyses WHERE id = ? AND owner_id = ?').get(id, u.ownerId);
    if (!r) return Response.json({ success: false, error: '记录不存在' }, { status: 404 });

    // 复制到提示词工坊
    if (toWorkshop) {
      db.prepare(
        'INSERT INTO prompts (owner_id, folder_id, name, content, created_at) VALUES (?,?,?,?,?)',
      ).run(u.ownerId, targetFolderId ?? null, r.title || '分镜提示词', r.storyboard, Date.now());
      if (action === 'move') db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
      return Response.json({ success: true });
    }

    if (action === 'copy') {
      db.prepare(
        `INSERT INTO analyses (owner_id, folder_id, mode, model, source_url, video_url, subtitle_url, segment_seconds, storyboard, title, tags, summary, favorite, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      ).run(
        u.ownerId, targetFolderId ?? null, r.mode, r.model, r.source_url, r.video_url, r.subtitle_url,
        r.segment_seconds, r.storyboard, r.title, r.tags, r.summary, Date.now(),
      );
    } else {
      db.prepare('UPDATE analyses SET folder_id = ? WHERE id = ?').run(targetFolderId ?? null, id);
    }
    return Response.json({ success: true });
  }

  if (type === 'prompt') {
    const r: any = db.prepare('SELECT * FROM prompts WHERE id = ? AND owner_id = ?').get(id, u.ownerId);
    if (!r) return Response.json({ success: false, error: '记录不存在' }, { status: 404 });
    if (action === 'copy') {
      db.prepare('INSERT INTO prompts (owner_id, folder_id, name, content, meta, created_at) VALUES (?,?,?,?,?,?)').run(
        u.ownerId, targetFolderId ?? null, r.name, r.content, r.meta, Date.now(),
      );
    } else {
      db.prepare('UPDATE prompts SET folder_id = ? WHERE id = ?').run(targetFolderId ?? null, id);
    }
    return Response.json({ success: true });
  }

  return Response.json({ success: false, error: '未知的 type' }, { status: 400 });
}
