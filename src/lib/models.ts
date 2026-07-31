/**
 * 反推模型注册表 —— 「反推模型有多种」在这里定义。
 *
 * 全部通过 巧匠中转 (https://api.lk888.ai/api/v1, OpenAI 兼容) 调用。
 * 你只需把想接的模型 ID 填进来,前端会自动渲染成下拉选择;后端按选中的 id 调用。
 *
 * vision: true  表示该模型支持图像输入(用于「看关键帧」反推画面/镜头)。
 * 只有 vision 模型才能真正反推 Seedance 2.0 分镜;非 vision 模型仅能基于字幕/文本反推。
 */
export type ReverseModel = {
  id: string; // 传给巧匠的 model 参数
  label: string; // 前端展示名
  vision: boolean; // 是否多模态(可读图)
  note?: string;
};

export const REVERSE_MODELS: ReverseModel[] = [
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview（最强·多模态）',
    vision: true,
    note: '默认推荐,反推细节最丰富',
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5（多模态·不稳时自动回退）',
    vision: true,
    note: '该模型在中转上偶发空输出/超时,遇到会自动改用 Gemini 3.1 Pro Preview 完成',
  },
];

export const DEFAULT_MODEL = REVERSE_MODELS[0].id;

export function getModel(id: string | undefined | null): ReverseModel {
  return REVERSE_MODELS.find((m) => m.id === id) || REVERSE_MODELS[0];
}
