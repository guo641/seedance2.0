import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';

/**
 * 延迟加载 ffmpeg 相关原生依赖。
 * 关键:不要在模块顶层 import ffmpeg-static / ffprobe-static / fluent-ffmpeg。
 * 否则在打包版(standalone / Electron 桌面)里,一旦这些包的某个二进制/子依赖
 * 没被正确打进产物,整个 video 模块在 import 时就会崩溃,连带 pipeline、
 * /api/trigger-analyze-url 路由一起加载失败,Next 会返回 HTML 500 —— 前端表现为
 * 神秘的 "Unexpected token '<', "<!DOCTYPE ... is not valid JSON"。
 * 改为「用到时才 require」,纯文本(电影解说文案)反推等不碰视频的功能就完全不依赖 ffmpeg。
 */
let _ff: any = null;
function getFfmpeg(): any {
  if (_ff) return _ff;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpeg = require('fluent-ffmpeg');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (e) {
    console.warn('[video] ffmpeg-static 不可用:', (e as Error)?.message);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffprobeStatic = require('ffprobe-static');
    if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);
  } catch (e) {
    console.warn('[video] ffprobe-static 不可用:', (e as Error)?.message);
  }
  _ff = ffmpeg;
  return ffmpeg;
}

export function probeDuration(input: string): Promise<number> {
  const ffmpeg = getFfmpeg();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err: any, data: any) => {
      if (err) return reject(err);
      resolve(data.format?.duration || 0);
    });
  });
}

/** 等间隔抽取 N 张关键帧,返回 data URL(base64 jpeg)数组 */
export async function extractFrames(input: string, maxFrames: number): Promise<string[]> {
  return (await extractFramesTimed(input, maxFrames)).map((f) => f.dataUrl);
}

export type TimedFrame = { dataUrl: string; t: number }; // t = 秒

/** 在指定的一组时间点(秒)各抽一帧,返回带时间戳的帧(按时间升序)。 */
export async function extractAtTimestamps(input: string, times: number[]): Promise<TimedFrame[]> {
  const uniq = Array.from(new Set(times.map((t) => Math.max(0, Math.round(t * 10) / 10)))).sort(
    (a, b) => a - b,
  );
  if (!uniq.length) return [];
  const ffmpeg = getFfmpeg();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .on('end', () => resolve())
      .on('error', reject)
      .screenshots({ timestamps: uniq, filename: 'f-%i.jpg', folder: dir, size: '640x?' });
  });
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jpg'))
    .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'));
  const out: TimedFrame[] = files.map((f, i) => {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    return { dataUrl: `data:image/jpeg;base64,${b64}`, t: Math.round(uniq[i] ?? i) };
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

/**
 * 抽帧并带时间戳(均匀 count 张)。
 */
export async function extractFramesTimed(input: string, count: number): Promise<TimedFrame[]> {
  const duration = await probeDuration(input).catch(() => 0);
  const n = Math.max(1, count);
  const times =
    duration > 0
      ? Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * duration)
      : Array.from({ length: n }, (_, i) => i);
  return extractAtTimestamps(input, times);
}

/** 根据视频时长自适应帧数:约每 FRAME_EVERY_SEC 秒 1 帧,夹在 [min, max]。 */
export function adaptiveFrameCount(durationSec: number): number {
  const every = Number(process.env.FRAME_EVERY_SEC || 2.5);
  const min = Number(process.env.MIN_FRAMES || 12);
  const max = Number(process.env.MAX_FRAMES || 32);
  if (!durationSec || durationSec <= 0) return min;
  return Math.min(max, Math.max(min, Math.ceil(durationSec / every)));
}

/** 抽取音轨为 mp3(供 ASR) */
export async function extractAudio(input: string): Promise<string> {
  const out = path.join(os.tmpdir(), `audio-${nanoid(8)}.mp3`);
  const ffmpeg = getFfmpeg();
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .on('end', () => resolve())
      .on('error', reject)
      .save(out);
  });
  return out;
}

/** 下载远程视频到临时文件。支持 Range 时用多连接并发分块下载(明显提速)。 */
export async function downloadTo(url: string): Promise<string> {
  const UA = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.douyin.com/' };
  const out = path.join(os.tmpdir(), `dl-${nanoid(8)}.mp4`);

  // 探测总大小 + 是否支持 Range
  let total = 0;
  let rangeOk = false;
  try {
    const head = await fetch(url, { method: 'HEAD', headers: UA });
    total = Number(head.headers.get('content-length')) || 0;
    rangeOk = (head.headers.get('accept-ranges') || '').includes('bytes');
  } catch {
    /* 忽略,回退单连接 */
  }

  const CONC = Number(process.env.DOWNLOAD_CONNECTIONS || 16);
  if (rangeOk && total > 2 * 1024 * 1024 && CONC > 1) {
    const chunkSize = Math.ceil(total / CONC);
    const buf = Buffer.allocUnsafe(total);
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        const start = i * chunkSize;
        if (start >= total) return;
        const end = Math.min(total - 1, (i + 1) * chunkSize - 1);
        const r = await fetch(url, { headers: { ...UA, Range: `bytes=${start}-${end}` } });
        if (!r.ok && r.status !== 206) throw new Error(`分块下载失败 HTTP ${r.status}`);
        Buffer.from(await r.arrayBuffer()).copy(buf, start);
      }
    }
    const dt0 = Date.now();
    try {
      await Promise.all(Array.from({ length: CONC }, () => worker()));
      fs.writeFileSync(out, buf);
      console.log(`[downloadTo] 并发${CONC}路 ${((Date.now() - dt0) / 1000).toFixed(1)}s (${(total / 1e6).toFixed(1)}MB)`);
      return out;
    } catch (e) {
      console.warn('[downloadTo] 并发失败,回退单连接:', (e as Error)?.message);
    }
  } else {
    console.log(`[downloadTo] 单连接(total=${total} rangeOk=${rangeOk})`);
  }

  // 单连接兜底
  const st = Date.now();
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`下载视频失败: HTTP ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`[downloadTo] 单连接完成 ${((Date.now() - st) / 1000).toFixed(1)}s`);
  return out;
}
