import path from 'node:path';

const UP_DIR = path.join(process.cwd(), 'data', 'uploads');

/** 把上传返回的 /api/media/<name> 映射回本地文件路径;远程 URL 原样返回。 */
export function resolveVideoInput(videoUrl: string): string {
  const m = videoUrl.match(/\/api\/media\/([^/?#]+)$/);
  if (m) return path.join(UP_DIR, path.basename(decodeURIComponent(m[1])));
  return videoUrl; // http(s) 直链
}
