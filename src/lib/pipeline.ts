import { chatWithFallback } from './yunwu';
import { transcribeAudio } from './asr';
import {
  extractFramesTimed,
  extractAtTimestamps,
  extractAudio,
  probeDuration,
  downloadTo,
  adaptiveFrameCount,
  type TimedFrame,
} from './video';
import { getModel } from './models';
import {
  reverseSystemPrompt,
  reverseUserPrompt,
  reverseFromSubtitleUserPrompt,
  commentarySystemPrompt,
  commentaryUserPrompt,
  adjustSystemPrompt,
  buildAdjustInstruction,
  variantSystemPrompt,
  variantUserPrompt,
  type AdjustKey,
  type VariantDims,
  SEGMENT_SECONDS,
} from './prompts';
import { detectSegmentSeconds } from './storyboard';
import fs from 'node:fs';

// 输出 token 上限(防止多段分镜被截断)
const MAX_OUT = Number(process.env.MAX_OUTPUT_TOKENS || 16000);

/** 从本地或远程视频生成字幕(SRT 文本) */
export async function makeSubtitle(videoPathOrUrl: string): Promise<string> {
  const local = /^https?:\/\//.test(videoPathOrUrl)
    ? await downloadTo(videoPathOrUrl)
    : videoPathOrUrl;
  const audio = await extractAudio(local);
  try {
    return (await transcribeAudio(audio)).text;
  } finally {
    fs.rmSync(audio, { force: true });
    if (local !== videoPathOrUrl) fs.rmSync(local, { force: true });
  }
}

/** 核心:反推 Seedance 2.0 分镜提示词 */
export async function reverseStoryboard(opts: {
  videoPathOrUrl?: string; // 有视频则抽帧
  subtitle?: string;
  modelId: string;
  segmentSeconds?: number;
  style?: string; // 输出风格
  onProgress?: (msg: string) => void;
}): Promise<{ storyboard: string; usedFrames: number; durationSec: number }> {
  const model = getModel(opts.modelId);
  const seg = opts.segmentSeconds || SEGMENT_SECONDS;

  // 纯文本模型 或 无视频 → 走字幕反推
  if (!opts.videoPathOrUrl || !model.vision) {
    if (!opts.subtitle?.trim())
      throw new Error('该模型为纯文本或无视频输入,必须提供字幕/文案才能反推');
    opts.onProgress?.('文本反推中...');
    const { text: storyboard } = await chatWithFallback({
      model: model.id,
      system: reverseSystemPrompt(seg, opts.style),
      user: reverseFromSubtitleUserPrompt(opts.subtitle, seg),
    });
    return { storyboard, usedFrames: 0, durationSec: 0 };
  }

  // 视觉反推:下载一次,同时抽帧 + 转写台词
  opts.onProgress?.('下载/抽取关键帧...');
  const local = /^https?:\/\//.test(opts.videoPathOrUrl)
    ? await downloadTo(opts.videoPathOrUrl)
    : opts.videoPathOrUrl;
  let frames: TimedFrame[] = [];
  let durationSec = 0;
  let subtitle = opts.subtitle;
  let subtitleTimed = false; // 字幕是否含时间戳(SRT)
  let subtitleOcr = false; // 是否退化为"读画面字幕"模式
  let dialogueFrameCount = 0;
  try {
    durationSec = await probeDuration(local).catch(() => 0);

    // 先转写(拿到 SRT 的每句时间戳),再据此决定抽帧点
    let cues: { start: number; end: number; text: string }[] = [];
    if (!subtitle?.trim()) {
      try {
        const audio = await extractAudio(local);
        try {
          const r = await transcribeAudio(audio, (m) => (opts.onProgress ? opts.onProgress(m) : void 0));
          subtitle = r.text;
          subtitleTimed = r.timed;
          cues = r.cues;
        } finally {
          fs.rmSync(audio, { force: true });
        }
      } catch (e) {
        console.warn('[pipeline] 台词转写失败,继续无台词反推:', (e as Error)?.message);
      }
    }

    // 若探测不到时长(下载文件元数据异常),用字幕最后一句的结束时间兜底
    if ((!durationSec || durationSec <= 0) && cues.length) {
      durationSec = Math.ceil(cues[cues.length - 1].end) + 1;
    }

    const dialogueTimes = cues.map((c) => (c.start + c.end) / 2);
    dialogueFrameCount = dialogueTimes.length;

    let times: number[];
    if (dialogueTimes.length) {
      // 有台词时间戳:每句中点一帧(谁在说话) + 均匀铺场景帧,总数封顶
      opts.onProgress?.('按台词时间点抽取关键帧...');
      const MAX_TOTAL = Number(process.env.MAX_TOTAL_FRAMES || 40);
      const uCount = adaptiveFrameCount(durationSec);
      const uniform: number[] = Array.from({ length: uCount }, (_, i) =>
        durationSec > 0 ? ((i + 0.5) / uCount) * durationSec : i,
      );
      times = [...dialogueTimes, ...uniform];
      if (times.length > MAX_TOTAL) {
        const keepUniform = Math.max(0, MAX_TOTAL - dialogueTimes.length);
        const step = uniform.length / Math.max(1, keepUniform);
        const sampledUniform =
          keepUniform > 0 ? uniform.filter((_, i) => i % Math.ceil(step) === 0).slice(0, keepUniform) : [];
        times = [...dialogueTimes.slice(0, MAX_TOTAL), ...sampledUniform];
      }
    } else {
      // 无台词时间戳(ASR 不可用):靠画面烧录字幕,抽更密的均匀帧供 gemini 逐帧 OCR
      opts.onProgress?.('语音转写不可用,改为密集抽帧读画面字幕...');
      subtitleOcr = true;
      const ocrMax = Number(process.env.OCR_MAX_FRAMES || 48);
      const n =
        durationSec > 0 ? Math.min(ocrMax, Math.max(adaptiveFrameCount(durationSec), Math.ceil(durationSec / 2))) : adaptiveFrameCount(durationSec);
      times = Array.from({ length: n }, (_, i) => (durationSec > 0 ? ((i + 0.5) / n) * durationSec : i));
    }
    frames = await extractAtTimestamps(local, times);
  } finally {
    if (local !== opts.videoPathOrUrl) fs.rmSync(local, { force: true });
  }

  opts.onProgress?.(
    subtitleOcr
      ? `分镜反推中(${frames.length}帧·读画面字幕 · ${model.label})...`
      : `分镜反推中(${frames.length}帧,其中${dialogueFrameCount}帧对准台词时刻 · ${model.label})...`,
  );
  const { text: storyboard } = await chatWithFallback({
    model: model.id,
    system: reverseSystemPrompt(seg, opts.style),
    user: reverseUserPrompt({
      subtitle,
      subtitleTimed,
      subtitleOcr,
      frameCount: frames.length,
      frameTimestamps: frames.map((f) => f.t),
      dialogueAligned: dialogueFrameCount > 0,
      segmentSeconds: seg,
      durationSec,
    }),
    images: frames.map((f) => f.dataUrl),
    maxTokens: MAX_OUT,
  });
  return { storyboard, usedFrames: frames.length, durationSec };
}

/** 一键提取字幕/文案:视频直链 → 下载音轨 → 必剪 ASR → { srt(带时间戳), text(纯文案), cues } */
export async function extractSubtitle(
  videoUrl: string,
  onProgress?: (m: string) => void,
): Promise<{ srt: string; text: string; cues: { start: number; end: number; text: string }[] }> {
  onProgress?.('下载视频音轨...');
  const local = /^https?:\/\//.test(videoUrl) ? await downloadTo(videoUrl) : videoUrl;
  const audio = await extractAudio(local);
  try {
    const r = await transcribeAudio(audio, onProgress);
    const text = r.cues.length ? r.cues.map((c) => c.text).join('\n') : r.text;
    return { srt: r.text, text, cues: r.cues };
  } finally {
    fs.rmSync(audio, { force: true });
    if (local !== videoUrl) fs.rmSync(local, { force: true });
  }
}

/** 电影解说文案 → 画面提示词(纯文本反推,不依赖视频/ASR)。 */
export async function reverseFromCommentary(opts: {
  script: string;
  modelId: string;
  segmentSeconds?: number;
  totalSeconds?: number; // 用户已知的文案总时长(可选)
  style?: string;
  onProgress?: (msg: string) => void;
}): Promise<{ storyboard: string }> {
  const seg = opts.segmentSeconds || SEGMENT_SECONDS;
  opts.onProgress?.('解析解说文案、反推画面中...');
  const { text: storyboard } = await chatWithFallback({
    model: getModel(opts.modelId).id,
    system: commentarySystemPrompt(seg, opts.style),
    user: commentaryUserPrompt(opts.script, seg, opts.totalSeconds),
    maxTokens: MAX_OUT,
  });
  return { storyboard };
}

/** 时长调整。seg = 原分镜每段秒数(自动识别),新版本沿用同样的段长。 */
export async function adjustDuration(
  storyboard: string,
  key: AdjustKey,
  modelId: string,
  seg?: number,
): Promise<string> {
  const segSeconds = seg && seg > 0 ? seg : detectSegmentSeconds(storyboard);
  const instruction = buildAdjustInstruction(key, segSeconds);
  return (
    await chatWithFallback({
      model: getModel(modelId).id,
      system: adjustSystemPrompt(segSeconds),
      user: `【原始分镜(每段 ${segSeconds} 秒)】\n${storyboard}\n\n【改写指令】\n${instruction}`,
      maxTokens: MAX_OUT,
    })
  ).text;
}

/** 生成变体。段长沿用源分镜(自动识别),除非改写维度要求改时长。 */
export async function generateVariant(
  source: string,
  dims: VariantDims,
  modelId: string,
  seg?: number,
): Promise<string> {
  const segSeconds = seg && seg > 0 ? seg : detectSegmentSeconds(source);
  return (
    await chatWithFallback({
      model: getModel(modelId).id,
      system: variantSystemPrompt(segSeconds),
      user: variantUserPrompt(source, dims),
      maxTokens: MAX_OUT,
    })
  ).text;
}
