import { requireKey } from '@/lib/api';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

const UP_DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'uploads');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const MAX_BYTES = 200 * 1024 * 1024; // 200MB,与原程序一致
const OK_EXT = ['.mp4', '.mov', '.webm', '.mkv', '.m4v'];

// 普通上传(<= 直传)。大文件分片见 PUT/PATCH。
export async function POST(req: Request) {
  try {
    await requireKey();
  } catch (r) {
    return r as Response;
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    return Response.json({ success: false, error: '未收到文件' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { success: false, error: '视频过大,最大支持 200MB,请先手动压缩后再上传' },
      { status: 413 },
    );
  const ext = path.extname(file.name).toLowerCase();
  if (!OK_EXT.includes(ext))
    return Response.json(
      { success: false, error: '不支持该视频格式,请上传 mp4/mov/webm 等视频文件' },
      { status: 415 },
    );

  const id = nanoid(12);
  const name = `${id}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UP_DIR, name), buf);

  return Response.json({
    success: true,
    data: { videoUrl: `/api/media/${name}`, fileName: file.name, size: file.size },
  });
}
