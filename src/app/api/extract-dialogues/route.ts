import { currentKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { chat } from '@/lib/yunwu';
import { EXTRACT_DIALOGUE_SYSTEM } from '@/lib/prompts';
import { DEFAULT_MODEL } from '@/lib/models';

// 从分镜/文案中提取台词
export async function POST(req: Request) {
  const u = await currentKey();
  if (!u) return Response.json({ success: false, error: '请先输入你的秘钥' }, { status: 401 });
  const { text, model = DEFAULT_MODEL } = await req.json().catch(() => ({}));
  if (!text) return Response.json({ success: false, error: '缺少文本' }, { status: 400 });
  try {
    const raw = await runWithKey({ apiKey: u.apiKey, baseUrl: u.baseUrl }, () =>
      chat({ model, system: EXTRACT_DIALOGUE_SYSTEM, user: text, temperature: 0 }),
    );
    const json = raw.replace(/^```json\s*|\s*```$/g, '').trim();
    const dialogues = JSON.parse(json);
    return Response.json({ success: true, data: { dialogues } });
  } catch (e: any) {
    return Response.json({ success: false, error: `大模型提取台词失败: ${e?.message || e}` });
  }
}
