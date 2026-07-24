'use client';
import { useState } from 'react';
import { api, postJSON } from '@/lib/client';
import StoryboardView from './StoryboardView';

function ratioLabel(r: number) {
  if (Math.abs(r - 1) < 0.01) return '时长不变';
  return r < 1 ? `精简至 ${Math.round(r * 100)}%` : `加长至 ${Math.round(r * 100)}%`;
}

/** 变体生成面板 —— 反推结果 / 提示词工坊 通用。source = 原始分镜提示词。 */
export default function VariantPanel({ source, model }: { source: string; model?: string }) {
  const [dims, setDims] = useState<any>({
    scene: false,
    costume: false,
    dialogue: 'reword',
    camera: false,
    durationRatio: 1,
  });
  const [busy, setBusy] = useState('');
  const [variants, setVariants] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function gen() {
    setErr('');
    setBusy('生成变体中...');
    try {
      const t = await postJSON('/api/generate-variant', { source, dims, model });
      if (!t.success) throw new Error(t.error);
      let content = '';
      for (let i = 0; i < 200; i++) {
        const s = await api(`/api/generate-variant?taskId=${t.taskId}`);
        if (s.status === 'success') {
          content = s.content;
          break;
        }
        if (s.status === 'failed') throw new Error(s.error);
        await new Promise((r) => setTimeout(r, 2500));
      }
      setVariants((v) => [content, ...v]);
    } catch (e: any) {
      setErr(e?.message || '变体生成失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card p-4 bg-ink/50">
      <div className="text-sm font-medium mb-2">生成变体（防同质化 · 可回喂 Seedance 2.0）</div>
      <div className="flex flex-wrap gap-3 text-sm items-center">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dims.scene} onChange={(e) => setDims({ ...dims, scene: e.target.checked })} />
          场景变换
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dims.costume} onChange={(e) => setDims({ ...dims, costume: e.target.checked })} />
          服装变化
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dims.camera} onChange={(e) => setDims({ ...dims, camera: e.target.checked })} />
          镜头语言变化
        </label>
        <label className="flex items-center gap-1">
          台词
          <select
            className="input py-1 w-auto"
            value={dims.dialogue}
            onChange={(e) => setDims({ ...dims, dialogue: e.target.value })}
          >
            <option value="reword">换说法</option>
            <option value="keep">不变</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 mt-3 text-sm">
        <span className="whitespace-nowrap">时长倍率</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={dims.durationRatio}
          onChange={(e) => setDims({ ...dims, durationRatio: Number(e.target.value) })}
          className="flex-1 accent-accent"
        />
        <span className="tag whitespace-nowrap">
          {dims.durationRatio}× · {ratioLabel(dims.durationRatio)}
        </span>
        <button className="btn-primary py-1" disabled={!!busy} onClick={gen}>
          {busy || '生成变体'}
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        0.5× 精简一半 → 1× 不变 → 2× 加长2倍(段长不变,按倍率精确增减段数)
      </div>
      {err && <p className="text-sm text-red-400 mt-1">{err}</p>}

      {variants.map((v, i) => (
        <div key={i} className="mt-3 border-t border-line pt-3">
          <div className="text-xs text-accent2 mb-1">变体 {variants.length - i}</div>
          <StoryboardView text={v} />
        </div>
      ))}
    </div>
  );
}
