import OpenAI from 'openai';
import fs from 'node:fs';

import { getKeyCtx } from './keystore';

/**
 * 巧匠中转 (https://api.lk888.ai/api/v1) OpenAI 兼容客户端。
 * 旧名 yunwu 是历史遗留,实际指代中转站本身;调用方式完全一致。
 * BYOK:优先用当前请求上下文里的用户 key;可传 explicitKey 覆盖(验证/测速用);再兜底 env。
 */
export function yunwu(explicitKey?: string, explicitBase?: string) {
  const ctx = getKeyCtx();
  const apiKey = explicitKey || ctx?.apiKey || process.env.YUNWU_API_KEY;
  if (!apiKey) throw new Error('未提供秘钥,请先在秘钥页输入你的秘钥');
  return new OpenAI({
    apiKey,
    baseURL: explicitBase || ctx?.baseUrl || process.env.YUNWU_BASE_URL || 'https://api.lk888.ai/api/v1',
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

  const body = {
    model: opts.model,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8000,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
    ],
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

  // gpt-5.5 / gemini 3.1 等「重思考」模型生成很慢,给足 5 分钟;超时/中转繁忙再重试一次。
  const PER_CALL_TIMEOUT = Number(process.env.CHAT_TIMEOUT_MS || 300000);
  const MAX_ATTEMPTS = 2;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.chat.completions.create(body, {
        timeout: PER_CALL_TIMEOUT,
        maxRetries: 0,
      });
      const choice = res.choices?.[0];
      const content = choice?.message?.content?.trim() || '';
      if (!content) {
        // 空正文一定是失败(常见:内容安全过滤 / 推理占满额度 / 该模型在中转上不产出正文如 gpt-5.5)。
        // 打上 emptyOutput 标记,供上层 chatWithFallback 自动改用可靠模型重试。
        const fr = choice?.finish_reason;
        let m: string;
        if (fr === 'content_filter')
          m = '该模型触发了内容安全过滤(文案含暴力/死亡等敏感情节),未能输出。建议换用 gemini-2.5-pro 重试,或调整文案措辞后再试。';
        else if (fr === 'length')
          m = '模型输出被长度限制截断且未产出正文(思考占满了额度)。请减少分段数量或更换反推模型后重试。';
        else m = `模型「${opts.model}」返回了空内容(finish_reason=${fr || 'unknown'})。请重试或更换反推模型。`;
        const err: any = new Error(m);
        err.emptyOutput = true;
        throw err;
      }
      return content;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);

      // OpenAI SDK 4.x 把所有底层网络错误一律包成 "Connection error." —— 解开看真实根因。
      let realMsg = msg;
      let realCause = '';
      if (msg.trim() === 'Connection error.' || /connection error/i.test(msg)) {
        // 优先看 SDK 自带的 cause(SDK 内部会附 OpenAIError)
        const cause = e?.cause || e?.error?.cause;
        if (cause) {
          realCause = String(cause?.message || cause);
          realMsg = realCause || msg;
        } else {
          realMsg = msg + ' (无 cause,可能 SDK 未加载或 Node 缺少全局 fetch)';
        }
      }

      const isTimeout = /请求超时|超时|timed?\s*out|timeout|ETIMEDOUT|ETIMEOUT/i.test(realMsg);
      const isNetErr = /fetch failed|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENOTFOUND|ENETUNREACH|EAI_AGAIN|socket hang up|TLS|handshake|certificate/i.test(realMsg);
      const retryable = isTimeout || /负载|饱和|overload|rate|limit|429|500|502|503|504|ECONNRESET|socket/i.test(realMsg);

      if (attempt < MAX_ATTEMPTS && retryable) continue;

      if (isTimeout)
        throw new Error(
          `模型「${opts.model}」响应超时(它较慢或中转繁忙)。请重试;若仍超时,建议改用 gemini-2.5-pro(更快更稳)。`,
        );

      // 网络层错误:把真实原因带出去,方便桌面端/网页端定位
      if (isNetErr) {
        const err: any = new Error(`网络请求失败(${realMsg})。请检查:①本机能否打开 https://yunwu.ai ②是否开了代理/VPN/Clash TUN 模式(可能劫持 Node 进程的 TLS 握手)③防火墙是否拦截`);
        err.netError = true;
        err.realCause = realCause;
        throw err;
      }

      throw e;
    }
  }
  throw lastErr;
}

/** 反推兜底模型:实测在巧匠中转上稳定产出、速度快。gpt-5.5/gemini-3.1 空输出或超时时自动改用它。 */
export const FALLBACK_MODEL = 'gemini-3.1-pro-preview';

/**
 * 反推专用 chat:选中的模型若「空输出 / 超时 / 中转繁忙」,自动改用可靠兜底模型重试一次,
 * 避免用户选了个别不稳定的模型(如 gpt-5.5)就直接失败、拿不到结果。
 */
export async function chatWithFallback(
  opts: Parameters<typeof chat>[0],
): Promise<{ text: string; usedModel: string; fellBack: boolean }> {
  try {
    const text = await chat(opts);
    return { text, usedModel: opts.model, fellBack: false };
  } catch (e: any) {
    const msg = String(e?.message || e);
    const worthFallback =
      e?.emptyOutput ||
      /空内容|内容安全过滤|长度限制|超时|timed?\s*out|timeout|负载|饱和|overload|429|5\d\d/i.test(msg);
    if (worthFallback && opts.model !== FALLBACK_MODEL) {
      console.warn(`[chat] 模型 ${opts.model} 失败(${msg.slice(0, 60)}),自动改用 ${FALLBACK_MODEL} 重试`);
      const text = await chat({ ...opts, model: FALLBACK_MODEL });
      return { text, usedModel: FALLBACK_MODEL, fellBack: true };
    }
    throw e;
  }
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
