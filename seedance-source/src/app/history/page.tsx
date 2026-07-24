'use client';
import { useEffect, useState } from 'react';
import Header, { useMe } from '@/components/Header';
import StoryboardView from '@/components/StoryboardView';
import { api, postJSON } from '@/lib/client';

const ADJUST = [
  { key: 'shorten_smart', label: '智能缩短' },
  { key: 'shorten_2_3', label: '缩短至2/3' },
  { key: 'shorten_1_2', label: '缩短至一半' },
  { key: 'shorten_1_3', label: '缩短至1/3' },
  { key: 'extend_smart', label: '智能增加' },
  { key: 'extend_1_5', label: '增加至1.5倍' },
  { key: 'extend_2', label: '增加至2倍' },
  { key: 'extend_3', label: '增加至3倍' },
];

export default function History() {
  const { me, quota } = useMe();
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [onlyFav, setOnlyFav] = useState(false);
  const [busy, setBusy] = useState('');

  async function load() {
    const r = await api('/api/analysis-history');
    if (r.success) setList(r.data);
  }
  useEffect(() => {
    if (me) load();
  }, [me]);

  async function del(id: number) {
    if (!confirm('确定删除这条分析记录吗？')) return;
    await fetch(`/api/analysis-history?id=${id}`, { method: 'DELETE' });
    setActive(null);
    load();
  }
  async function toggleFav(item: any) {
    if (item.favorite) await fetch(`/api/favorites/${item.id}`, { method: 'DELETE' });
    else await postJSON('/api/favorites', { id: item.id });
    load();
  }
  async function adjust(item: any, key: string) {
    setBusy('时长调整中...');
    try {
      const t = await postJSON('/api/adjust-duration', {
        storyboard_text: item.storyboard,
        adjust_key: key,
        model: item.model,
        segment_duration: item.segmentSeconds, // 沿用原分镜段长(如 15 秒)
      });
      if (!t.success) throw new Error(t.error);
      // 轮询
      let result = '';
      for (let i = 0; i < 200; i++) {
        const s = await api(`/api/adjust-duration/status?taskId=${t.taskId}`);
        if (s.status === 'success') {
          result = s.result;
          break;
        }
        if (s.status === 'failed') throw new Error(s.error);
        await new Promise((r) => setTimeout(r, 2500));
      }
      // 存为新记录
      await postJSON('/api/analysis-history', {
        storyboard: result,
        mode: item.mode,
        model: item.model,
        title: `${item.title || '分镜'}·${ADJUST.find((a) => a.key === key)?.label}`,
        segmentSeconds: item.segmentSeconds,
      });
      load();
      alert('已生成新时长版本并保存');
    } catch (e: any) {
      alert('时长调整失败: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  }

  const shown = onlyFav ? list.filter((x) => x.favorite) : list;

  if (!me)
    return (
      <>
        <Header me={me} quota={quota} tab="/history" />
        <p className="text-center mt-20 text-gray-400">请登录后查看历史库</p>
      </>
    );

  return (
    <>
      <Header me={me} quota={quota} tab="/history" />
      <main className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-[320px_1fr] gap-4">
        <aside className="space-y-2">
          <div className="flex gap-2 text-sm mb-2">
            <button className={`tag ${!onlyFav && 'bg-accent text-white'}`} onClick={() => setOnlyFav(false)}>
              全部 ({list.length})
            </button>
            <button className={`tag ${onlyFav && 'bg-accent text-white'}`} onClick={() => setOnlyFav(true)}>
              收藏夹
            </button>
          </div>
          {shown.length === 0 && <p className="text-sm text-gray-500">暂无分析历史</p>}
          {shown.map((it) => (
            <div
              key={it.id}
              onClick={() => setActive(it)}
              className={`card p-3 cursor-pointer ${active?.id === it.id ? 'border-accent' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium truncate">{it.title || '未命名'}</div>
                <button onClick={(e) => (e.stopPropagation(), toggleFav(it))}>
                  {it.favorite ? '⭐' : '☆'}
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{it.summary || it.storyboard.slice(0, 60)}</div>
              <div className="flex gap-1 mt-1">
                {(it.tags || []).slice(0, 3).map((t: string) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <section className="card p-5">
          {active ? (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-bold">{active.title || '分镜详情'}</h2>
                <div className="flex gap-2 text-sm">
                  <button className="btn-ghost py-1" onClick={() => navigator.clipboard.writeText(active.storyboard)}>
                    复制全部
                  </button>
                  <button className="btn-ghost py-1" onClick={() => del(active.id)}>
                    删除
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1">时长调整（生成新版本）</div>
                <div className="flex flex-wrap gap-1">
                  {ADJUST.map((a) => (
                    <button
                      key={a.key}
                      disabled={!!busy}
                      className="tag hover:bg-accent hover:text-white"
                      onClick={() => adjust(active, a.key)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {busy && <p className="text-xs text-yellow-400 mt-1">{busy}</p>}
              </div>
              <StoryboardView text={active.storyboard} />
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
              选择左侧记录查看详情
            </div>
          )}
        </section>
      </main>
    </>
  );
}
