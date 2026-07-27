import { ensureUploadDir, uploadPath } from '@/lib/media';
import fs from 'node:fs';
import path from 'node:path';

// 提供上传视频的播放/下载
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const safe = path.basename(name); // 防目录穿越
  ensureUploadDir();
  const file = uploadPath(safe);
  if (!fs.existsSync(file)) return new Response('Not Found', { status: 404 });
  const stat = fs.statSync(file);
  const ext = path.extname(safe).toLowerCase();
  const type =
    ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
  return new Response(fs.createReadStream(file) as any, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
    },
  });
}
