import { REVERSE_MODELS, DEFAULT_MODEL } from '@/lib/models';
import { STYLE_PRESETS } from '@/lib/prompts';

// 前端拉取「反推模型有多种」下拉列表 + 输出风格预设
export async function GET() {
  return Response.json({
    success: true,
    data: { models: REVERSE_MODELS, default: DEFAULT_MODEL, styles: STYLE_PRESETS },
  });
}
