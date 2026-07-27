import path from 'node:path';
import fs from 'node:fs';

// 打包后 Electron 会把 DATA_DIR 指向用户可写目录；开发时回落到项目 data 目录。
// 所有上传、播放、ASR 解析必须共用这一个目录，否则桌面版会把 /api/media/*
// 错映射到 resources/app/data/uploads，ffmpeg 会报 No such file or directory。
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function uploadPath(name: string): string {
  return path.join(UPLOAD_DIR, path.basename(decodeURIComponent(name)));
}

/** 把上传返回的 /api/media/<name> 映射回本地文件路径;远程 URL 原样返回。 */
export function resolveVideoInput(videoUrl: string): string {
  const m = videoUrl.match(/\/api\/media\/([^/?#]+)$/);
  if (m) return uploadPath(m[1]);
  return videoUrl; // http(s) 直链
}
