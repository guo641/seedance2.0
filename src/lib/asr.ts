/**
 * 台词转写编排:按 ASR_PROVIDERS 顺序尝试多个引擎。
 * 默认 bcut(必剪·免费·带时间戳) → yunwu(whisper·付费·备用)。
 */
import { bcutTranscribe } from './bcutasr';
import { transcribe as yunwuTranscribe } from './yunwu';

export type AsrResult = {
  text: string;
  timed: boolean;
  cues: { start: number; end: number; text: string }[];
  provider: string;
};

export async function transcribeAudio(
  audioPath: string,
  onProgress?: (msg: string) => void,
): Promise<AsrResult> {
  const order = (process.env.ASR_PROVIDERS || 'bcut,yunwu')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let lastErr: any = null;
  for (const p of order) {
    try {
      if (p === 'bcut') {
        onProgress?.('必剪转写台词(免费·带时间戳)...');
        const r = await bcutTranscribe(audioPath);
        if (r.text) return { ...r, provider: 'bcut' };
      } else if (p === 'yunwu' || p === 'whisper') {
        onProgress?.('whisper 转写台词...');
        const r = await yunwuTranscribe(audioPath);
        if (r.text) return { ...r, provider: 'yunwu' };
      }
    } catch (e: any) {
      lastErr = e;
      console.warn(`[asr] 引擎 ${p} 失败:`, e?.message || e);
    }
  }
  throw new Error(`所有 ASR 引擎均失败: ${lastErr?.message || lastErr}`);
}
