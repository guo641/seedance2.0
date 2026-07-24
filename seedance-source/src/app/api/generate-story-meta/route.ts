import { currentKey } from '@/lib/api';
import { runWithKey } from '@/lib/keystore';
import { chat } from '@/lib/yunwu';
import { STORY_META_SYSTEM } from '@/lib/prompts';
import { DEFAULT_MODEL } from '@/lib/models';

// 生成标题/标签/梗概
export async function POST(req: Request) {
  const u = await currentKey();
  if (!u) return Response.json({ success: false, error: '请先输入你的秘钥' }, { status: 401 });
  const { storyboard, model = DEFAULT_MODEL } = await req.json().catch(() => ({}));
  if (!storyboard) return Response.json({ success: false, error: '缺少分镜' }, { status: 400 });
  try {
    const raw = await runWithKey({ apiKey: u.apiKey, baseUrl: u.baseUrl }, () =>
      chat({ model, system: STORY_META_SYSTEM, user: storyboard, temperature: 0.5 }),
    );
    const json = raw.replace(/^```json\s*|\s*```$/g, '').trim();
    const meta = JSON.parse(json);
    return Response.json({ success: true, data: meta });
  } catch {
    // 生成失败用默认值(与原程序「生成元数据失败,使用默认值」一致)
    return Response.json({
      success: true,
      data: { title: '未命名分镜', tags: [], summary: '' },
    });
  }
}
