'use client';
import { useEffect, useState } from 'react';
import Header, { useMe } from '@/components/Header';
import VariantPanel from '@/components/VariantPanel';
import { api, postJSON } from '@/lib/client';

export default function Workshop() {
  const { me, quota } = useMe();
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [paste, setPaste] = useState(''); // 粘贴框内容
  const [pasteSource, setPasteSource] = useState(''); // 已载入用于变体的粘贴内容
  // 变体维度
  const [dims, setDims] = useState<any>({ scene: false, costume: false, dialogue: 'reword', camera: false, durationRatio: 1 });

  function ratioLabel(r: number) {
    if (Math.abs(r - 1) < 0.01) return '时长不变';
    return r < 1 ? `精简至 ${Math.round(r * 100)}%` : `加长至 ${Math.round(r * 100)}%`;
  }

  async function load() {
    const r = await api('/api/prompt-workshop');
    if (r.success) setList(r.data);
  }
  useEffect(() => {
    if (me) load();
  }, [me]);

  async function loadVariants(id: number) {
    const r = await api(`/api/prompt-workshop?variantOf=${id}`);
    if (r.success) setVariants(r.data);
  }

  async function uploadTxt(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.name.endsWith('.txt')) continue;
      const content = await f.text();
      if (!content.trim()) continue;
      await postJSON('/api/prompt-workshop', { name: f.name.replace(/\.txt$/, ''), content });
    }
    load();
  }

  async function genVariant() {
    if (!active) return;
    setBusy('生成变体中...');
    try {
      const t = await postJSON('/api/generate-variant', { source: active.content, dims, model: undefined });
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
      await postJSON('/api/prompt-workshop', { content, variantOf: active.id, name: `${active.name}·变体` });
      loadVariants(active.id);
    } catch (e: any) {
      alert('变体生成失败: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  }

  async function del(id: number) {
    if (!confirm('确定删除这个提示词吗？')) return;
    await fetch(`/api/prompt-workshop?id=${id}`, { method: 'DELETE' });
    setActive(null);
    load();
  }

  if (!me)
    return (
      <>
        <Header me={me} quota={quota} tab="/workshop" />
        <p className="text-center mt-20 text-gray-400">请登录后使用提示词工坊</p>
      </>
    );

  return (
    <>
      <Header me={me} quota={quota} tab="/workshop" />
      <main className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-[300px_1fr] gap-4">
        <aside className="space-y-2">
          {/* 直接粘贴提示词 → 一键变原创 */}
          <div className="card p-3 bg-ink/40">
            <div className="text-sm font-medium mb-1">粘贴提示词,一键变原创</div>
            <textarea
              className="input h-24 text-sm"
              placeholder="把任意分镜提示词粘贴到这里,直接生成原创变体(无需先保存)"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button
              className="btn-primary w-full mt-2 text-sm"
              disabled={!paste.trim()}
              onClick={() => {
                setActive(null);
                setPasteSource(paste.trim());
              }}
            >
              载入并变原创
            </button>
          </div>

          <label className="btn-ghost block text-center cursor-pointer text-sm">
            或上传 TXT 生成提示词
            <input type="file" accept=".txt" multiple className="hidden" onChange={(e) => uploadTxt(e.target.files)} />
          </label>
          {list.length === 0 && <p className="text-sm text-gray-500 mt-2">还没有保存的提示词</p>}
          {list.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setActive(p);
                loadVariants(p.id);
              }}
              className={`card p-3 cursor-pointer ${active?.id === p.id ? 'border-accent' : ''}`}
            >
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-gray-500 line-clamp-2 mt-1">{p.content.slice(0, 60)}</div>
            </div>
          ))}
        </aside>

        <section className="card p-5">
          {active ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold">{active.name}</h2>
                <div className="flex gap-2 text-sm">
                  <button className="btn-ghost py-1" onClick={() => navigator.clipboard.writeText(active.content)}>
                    复制
                  </button>
                  <button className="btn-ghost py-1" onClick={() => del(active.id)}>
                    删除
                  </button>
                </div>
              </div>

              <div className="card p-3 mb-4 bg-ink/50">
                <div className="text-sm font-medium mb-2">生成变体（防同质化 · 多维度可选）</div>
                <div className="flex flex-wrap gap-3 text-sm">
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
                    <select className="input py-1 w-auto" value={dims.dialogue} onChange={(e) => setDims({ ...dims, dialogue: e.target.value })}>
                      <option value="reword">换说法</option>
                      <option value="keep">不变</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-2 w-full">
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
                  </div>
                  <button className="btn-primary py-1" disabled={!!busy} onClick={genVariant}>
                    {busy || '开始生成变体'}
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  倍率档:0.5× 精简一半 → 1× 不变 → 2× 加长2倍(每段时长不变,靠增减段数实现)
                </div>
              </div>

              <pre className="whitespace-pre-wrap text-sm leading-relaxed max-h-[40vh] overflow-auto">{active.content}</pre>

              {variants.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">变体（{variants.length}）</div>
                  {variants.map((v, i) => (
                    <details key={v.id} className="card p-3 mb-2">
                      <summary className="cursor-pointer text-sm">变体 {i + 1}</summary>
                      <pre className="whitespace-pre-wrap text-sm mt-2">{v.content}</pre>
                    </details>
                  ))}
                </div>
              )}
            </>
          ) : pasteSource ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold">粘贴的提示词 · 一键变原创</h2>
                <button className="btn-ghost py-1 text-sm" onClick={() => setPasteSource('')}>
                  清空
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed max-h-[30vh] overflow-auto mb-3 bg-ink/40 p-3 rounded">
                {pasteSource}
              </pre>
              <VariantPanel source={pasteSource} />
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
              左侧粘贴提示词「载入并变原创」,或上传 TXT / 选择已存提示词
            </div>
          )}
        </section>
      </main>
    </>
  );
}
