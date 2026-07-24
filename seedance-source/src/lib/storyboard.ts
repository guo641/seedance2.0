/** 把分镜全文解析成段落数组。兼容 "----" 分隔 与 "第N段" 起始两种情况。 */
export function parseSegments(text: string): string[] {
  if (!text?.trim()) return [];
  // 优先按分隔线切
  let parts = text
    .split(/\n?\s*-{3,}\s*\n?/g)
    .map((s) => s.trim())
    .filter(Boolean);
  // 没切开(或只有一段)则按"第N段"边界切
  if (parts.length <= 1) {
    parts = text
      .split(/(?=第\s*\d+\s*段)/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return parts.length ? parts : [text.trim()];
}

/** 从分镜文本识别"每段时长(秒)"——取各段完整时长的众数/最大值(最后一段常偏短,忽略)。 */
export function detectSegmentSeconds(text: string, fallback = 12): number {
  const times = [...text.matchAll(/时间[：:]\s*(\d+):(\d+)\s*[-~至]\s*(\d+):(\d+)/g)];
  const durs = times
    .map((m) => (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]))
    .filter((d) => d > 0 && d <= 120);
  if (!durs.length) return fallback;
  // 众数(四舍五入到整数);并列时取较大值
  const cnt = new Map<number, number>();
  for (const d of durs) cnt.set(d, (cnt.get(d) || 0) + 1);
  let best = durs[0];
  let bestC = 0;
  for (const [d, c] of cnt) if (c > bestC || (c === bestC && d > best)) (best = d), (bestC = c);
  return best;
}

/** 取某段的"台词"字段(用于快速判断是否识别到对话) */
export function extractDialogue(segment: string): string | null {
  const m = segment.match(/台词[：:]\s*([^；;\n]+)/);
  if (!m) return null;
  const v = m[1].trim();
  return /^无$|^无对白|^沉默/.test(v) ? null : v;
}
