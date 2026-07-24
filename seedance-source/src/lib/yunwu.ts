import OpenAI from 'openai';
import fs from 'node:fs';

import { getKeyCtx } from './keystore';

/**
 * yunwu.ai 中转客户端(OpenAI 兼容)。
 * BYOK:优先用当前请求上下文里的用户 key;可传 explicitKey 覆盖(验证/测速用);再兜底 env。
 */
export function yunwu(explicitKey?: string, explicitBase?: string) {
  const ctx = getKeyCtx();
  const apiKey = explicitKey || ctx?.apiKey || process.env.YUNWU_API_KEY;
  if (!apiKey) throw new Error('未提供秘钥,请先在秘钥页输入你的秘钥');
  return new OpenAI({
    apiKey,
    baseURL: explicitBase || ctx?.baseUrl || process.env.YUNWU_BASE_URL || 'https://yunwu.ai/v1',
    maxRetries: 0,
    timeout: 180000,
  });
}

export type ChatImage = { dataUrl: string };

/**
 * 通用 chat 调用。images 会作为 image_url content 附加(多模态)。
 */
export async function chat(opts: {
  model: string;
  system: string;
  user: string;
  images?: string[]; // data URL 列表
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const client = yunwu();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: opts.user },
  ];
  for (const img of opts.images || []) {
    userContent.push({ type: 'image_url', image_url: { url: img } });
  }

  const res = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8000,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || '';
}

/**
 * 音频转写(台词)。走 yunwu 的 /audio/transcriptions。
 * 优先用带时间戳的 SRT(whisper-1 支持),让下游能把台词按时间对齐到画面,大幅改善说话人归属;
 * 不支持 srt 的模型回退到 text。多模型降级 + 每个模型重试(应对"上游负载饱和")。
 * 返回 { text, timed }:timed=true 表示含时间戳(SRT)。
 */
export type Cue = { start: number; end: number; text: string }; // 秒

/** 解析 SRT 为 cue 列表(带秒级起止时间)。 */
export function parseSrt(srt: string): Cue[] {
  const cues: Cue[] = [];
  const re =
    /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*\n([\s\S]*?)(?=\n\s*\n|\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(srt))) {
    const start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    const end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const text = m[9].replace(/\n/g, ' ').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

export async function transcribe(
  audioPath: string,
): Promise<{ text: string; timed: boolean; cues: Cue[] }> {
  const client = yunwu();
  // 每个模型标注首选格式:whisper-1 走 srt(有时间戳),gpt-4o-transcribe 走 text
  const specs = (process.env.ASR_MODELS || 'whisper-1:srt,gpt-4o-transcribe:text,gpt-4o-mini-transcribe:text')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [model, fmt] = s.split(':');
      return { model, fmt: (fmt || 'text') as 'srt' | 'text' | 'verbose_json' };
    });

  // 整个 ASR 有总时间预算,超了就放弃(避免把整条反推卡死)
  const deadline = Date.now() + Number(process.env.ASR_BUDGET_MS || 90000);
  let lastErr: any = null;
  for (const { model, fmt } of specs) {
    const timedFmt = fmt === 'srt' || fmt === 'verbose_json';
    const maxAttempts = timedFmt ? 2 : 3; // srt 稀缺但过载时别死磕;text 是安全网,多给几次
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() > deadline) {
        throw new Error(`台词转写超时(预算内所有模型均不可用): ${lastErr?.message || lastErr || ''}`);
      }
      try {
        const res = await client.audio.transcriptions.create(
          {
            file: fs.createReadStream(audioPath) as unknown as File,
            model,
            response_format: fmt,
          },
          { timeout: 30000, maxRetries: 0 }, // 单次调用 30s 硬超时
        );
        const text = (typeof res === 'string' ? res : (res as { text?: string }).text || '').trim();
        if (text) return { text, timed: timedFmt, cues: timedFmt ? parseSrt(text) : [] };
        lastErr = new Error('转写结果为空');
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || e);
        const retryable = /负载|饱和|overload|rate|limit|429|408|500|502|503|upstream|timeout/i.test(msg);
        if (retryable && attempt < maxAttempts - 1 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // 1.5s,3s
          continue;
        }
        break;
      }
    }
  }
  throw new Error(`台词转写失败(已尝试 ${specs.map((s) => s.model).join('/')}): ${lastErr?.message || lastErr}`);
}
