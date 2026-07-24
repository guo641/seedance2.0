import { requireKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { chat } from '@/lib/yunwu';
import { REVERSE_MODELS } from '@/lib/models';

// 测速:用当前 key 逐个 ping 反推模型,返回 可用/延迟/错误
export async function GET() {
  let s;
  try {
    s = await requireKey();
  } catch (r) {
    return r as Response;
  }

  const results = await runWithKey({ apiKey: s.apiKey, baseUrl: s.baseUrl }, () =>
    Promise.all(
      REVERSE_MODELS.map(async (m) => {
        const t0 = Date.now();
        try {
          const out = await chat({
            model: m.id,
            system: '只回复:ok',
            user: 'ping',
            maxTokens: 5,
            temperature: 0,
          });
          return { id: m.id, label: m.label, ok: true, ms: Date.now() - t0, reply: out.slice(0, 20) };
        } catch (e: any) {
          const msg = String(e?.message || e);
          return { id: m.id, label: m.label, ok: false, ms: Date.now() - t0, error: msg.slice(0, 80) };
        }
      }),
    ),
  );

  return Response.json({ success: true, data: results });
}
