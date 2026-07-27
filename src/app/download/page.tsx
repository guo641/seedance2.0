'use client';
import { useEffect, useState, type DragEvent } from 'react';
import Header, { useMe } from '@/components/Header';
import { api, postJSON, pollTask } from '@/lib/client';

const PLATFORMS = [
  { id: 'douyin', label: '抖音' },
  { id: 'kuaishou', label: '快手' },
  { id: 'bilibili', label: 'B站' },
  { id: 'xhs', label: '小红书' },
  { id: 'toutiao', label: '头条' },
  { id: 'all', label: '自动识别' },
];

type Item = {
  id: string;
  link: string;
  status: 'idle' | 'parsing' | 'ok' | 'fail';
  error?: string;
  videoUrl?: string;
  title?: string;
  cover?: string;
  rev: 'idle' | 'queue' | 'running' | 'done' | 'fail';
  revMsg?: string;
  analysisId?: number;
  sub?: { status: 'running' | 'done' | 'fail'; msg?: string; srt?: string; text?: string };
};

function makeItemId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 触发文本下载 */
function downloadText(name: string, ext: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '字幕'}.${ext}`;
  a.click();
}

/** 从整段文本里按行提取链接(每行取第一个 http 链接;没有 http 的整行也算) */
function extractLinks(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => (l.match(/https?:\/\/[^\s]+/) || [l.trim()])[0])
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function DownloadPage() {
  const { me, quota } = useMe();
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('douyin');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [model, setModel] = useState('');
  const [seg, setSeg] = useState(12);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    api('/api/models').then((r) => {
      if (r.success) {
        setModels(r.data.models);
        setModel(r.data.default);
      }
    });
  }, []);

  const update = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const updateById = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function parseAll() {
    setErr('');
    const links = extractLinks(text);
    if (!links.length) return setErr('请粘贴至少一条视频链接(每行一条)');
    if (!me) return setErr('请先登录');
    const init: Item[] = links.map((link) => ({ id: makeItemId(), link, status: 'parsing', rev: 'idle' }));
    setItems(init);
    setBusy(true);
    // 并发解析(限 4 条同时)
    let idx = 0;
    async function worker() {
      while (idx < links.length) {
        const i = idx++;
        try {
          const r = await api(`/api/resolve-douyin?url=${encodeURIComponent(links[i])}&platform=${platform}`);
          if (r.success && r.data.videoUrl)
            update(i, { status: 'ok', videoUrl: r.data.videoUrl, title: r.data.title, cover: r.data.cover });
          else update(i, { status: 'fail', error: r.error || '解析失败' });
        } catch (e: any) {
          update(i, { status: 'fail', error: e?.message || '解析失败' });
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    setBusy(false);
  }

  function downloadOne(it: Item) {
    if (!it.videoUrl) return;
    const a = document.createElement('a');
    a.href = `/api/download?url=${encodeURIComponent(it.videoUrl)}&name=${encodeURIComponent(it.title || '视频')}`;
    a.click();
  }

  async function downloadAll() {
    for (const it of items) {
      if (it.status === 'ok') {
        downloadOne(it);
        await new Promise((r) => setTimeout(r, 900)); // 间隔,避免浏览器拦截
      }
    }
  }

  // 批量反推:逐条触发+轮询+存历史
  async function reverseAll() {
    if (!me) return setErr('请先登录');
    setRunning(true);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status !== 'ok' || it.rev === 'done') continue;
      try {
        update(i, { rev: 'running', revMsg: '反推中...' });
        const trig = await postJSON('/api/trigger-analyze-url', {
          video_url: it.videoUrl,
          model,
          segment_duration: seg,
        });
        if (!trig.success) throw new Error(trig.error || '触发失败');
        const done = await pollTask((id) => `/api/trigger-analyze/status?taskId=${id}`, trig.taskId, {
          onTick: (x) => x.progress && update(i, { revMsg: x.progress }),
        });
        const storyboard = done.result || done.storyboard;
        const meta = await postJSON('/api/generate-story-meta', { storyboard, model });
        const saved = await postJSON('/api/analysis-history', {
          storyboard,
          mode: 'douyin',
          model,
          sourceUrl: it.link,
          videoUrl: it.videoUrl,
          segmentSeconds: seg,
          title: meta?.data?.title || it.title,
          tags: meta?.data?.tags,
          summary: meta?.data?.summary,
        });
        update(i, { rev: 'done', revMsg: '完成', analysisId: saved?.data?.id });
      } catch (e: any) {
        update(i, { rev: 'fail', revMsg: e?.message || '反推失败' });
      }
    }
    setRunning(false);
  }

  // 提取字幕(单条):免费必剪 → SRT + TXT
  async function extractSubById(id: string, videoUrl: string) {
    updateById(id, { sub: { status: 'running', msg: '转写中...' } });
    try {
      const trig = await postJSON('/api/extract-subtitle', { video_url: videoUrl });
      if (!trig.success) throw new Error(trig.error || '触发失败');
      const done = await pollTask((id) => `/api/extract-subtitle/status?taskId=${id}`, trig.taskId, {
        onTick: (x) => x.progress && updateById(id, { sub: { status: 'running', msg: x.progress } }),
      });
      updateById(id, { sub: { status: 'done', srt: done.srt, text: done.text } });
    } catch (e: any) {
      updateById(id, { sub: { status: 'fail', msg: e?.message || '提取失败' } });
    }
  }

  async function extractSub(i: number) {
    const it = items[i];
    if (!it.videoUrl) return;
    await extractSubById(it.id, it.videoUrl);
  }

  // 上传本地视频 → 免下载,直接提字幕(和 AsrTools 一样快)
  async function uploadAndExtract(files: FileList | null) {
    if (!files || !files.length) return;
    if (!me) return setErr('请先登录');
    setErr('');
    for (const f of Array.from(files)) {
      const id = makeItemId();
      const item: Item = {
        id,
        link: f.name,
        status: 'parsing',
        rev: 'idle',
        title: f.name.replace(/\.[^.]+$/, ''),
        sub: { status: 'running', msg: '上传中...' },
      };
      setItems((arr) => [item, ...arr]);
      // 上传
      try {
        const fd = new FormData();
        fd.append('file', f);
        const up = await api('/api/upload', { method: 'POST', body: fd });
        if (!up.success) throw new Error(up.error || '上传失败');
        const videoUrl = up.data.videoUrl;
        // 直接提字幕(video_url = 本地media,免下载)
        updateById(id, { status: 'ok', videoUrl, sub: { status: 'running', msg: '转写中...' } });
        await extractSubById(id, videoUrl);
      } catch (e: any) {
        updateById(id, { status: 'fail', error: e?.message || '上传失败', sub: { status: 'fail', msg: e?.message || '上传失败' } });
      }
    }
  }

  function onDropVideo(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    uploadAndExtract(e.dataTransfer.files);
  }

  // 批量提取字幕(逐条串行)
  async function extractAllSub() {
    setRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'ok' && items[i].sub?.status !== 'done') await extractSub(i);
    }
    setRunning(false);
  }

  const okCount = items.filter((it) => it.status === 'ok').length;

  return (
    <>
      <Header me={me} quota={quota} tab="/download" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="card p-6 space-y-4">
          <div>
            <h1 className="text-lg font-bold">解析下载 · 批量</h1>
            <p className="text-sm text-gray-400">粘贴一条或多条链接(每行一条),批量解析无水印直链,可一键下载或批量反推分镜</p>
          </div>

          <div className="flex flex-wrap gap-1">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${platform === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-gray-400'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <textarea
            className="input h-28"
            placeholder="每行粘贴一条分享链接或文案,可粘多条批量处理"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-gray-400">反推模型(批量反推用)</span>
              <select className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-gray-400">分段时长(秒)</span>
              <input
                type="number"
                className="input mt-1"
                min={2}
                max={60}
                value={seg}
                onChange={(e) => setSeg(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={parseAll} disabled={busy || !me}>
              {busy ? '解析中...' : me ? '批量解析' : '请先登录'}
            </button>
          </div>

          <label
            className={`block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              dragActive ? 'border-accent bg-accent/10' : 'border-line hover:border-accent bg-ink/40'
            }`}
            title="已有视频文件?拖拽或点击上传,上传后自动提取字幕"
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={onDropVideo}
          >
            <input
              type="file"
              accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadAndExtract(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <div className="text-sm font-medium text-gray-200">拖拽视频到这里，自动上传并提取字幕</div>
            <div className="text-xs text-gray-500 mt-1">也可以点击选择文件，支持 mp4/mov/webm/mkv/m4v，单个最大 200MB</div>
          </label>
          {err && <p className="text-sm text-red-400">{err}</p>}

          {items.length > 0 && (
            <>
              <div className="flex gap-2 flex-wrap items-center">
                <span className="tag">解析成功 {okCount}/{items.length}</span>
                <div className="ml-auto flex gap-2 flex-wrap">
                  <button className="btn-ghost text-sm" disabled={!okCount} onClick={downloadAll}>
                    ⬇ 全部下载
                  </button>
                  <button className="btn-ghost text-sm" disabled={!okCount || running} onClick={extractAllSub}>
                    全部提取字幕
                  </button>
                  <button className="btn-primary text-sm" disabled={!okCount || running} onClick={reverseAll}>
                    {running ? '处理中...' : '🎬 全部反推分镜'}
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
                {items.map((it, i) => (
                  <div key={i} className="card p-3 bg-ink/40 flex gap-3">
                    {it.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.cover} alt="" className="w-16 h-20 object-cover rounded border border-line shrink-0" />
                    ) : (
                      <div className="w-16 h-20 rounded bg-line/40 shrink-0 flex items-center justify-center text-xs text-gray-500">
                        {i + 1}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium line-clamp-2">
                        {it.status === 'parsing' ? (it.link.startsWith('http') ? '解析中...' : '上传中...') : it.title || (it.status === 'fail' ? '解析失败' : '未命名')}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{it.link}</div>
                      {it.status === 'fail' && <div className="text-xs text-red-400">{it.error}</div>}
                      {it.rev !== 'idle' && (
                        <div className={`text-xs mt-0.5 ${it.rev === 'done' ? 'text-green-400' : it.rev === 'fail' ? 'text-red-400' : 'text-yellow-400'}`}>
                          反推:{it.revMsg}
                          {it.rev === 'done' && it.analysisId && (
                            <a className="underline ml-1" href="/history">
                              查看
                            </a>
                          )}
                        </div>
                      )}
                      {/* 字幕提取状态 + 两个版本下载 */}
                      {it.sub && (
                        <div className="mt-1">
                          {it.sub.status !== 'done' ? (
                            <div className={`text-xs ${it.sub.status === 'fail' ? 'text-red-400' : 'text-yellow-400'}`}>
                              字幕:{it.sub.msg}
                            </div>
                          ) : (
                            <div className="mt-1 border border-line p-2 bg-ink/60">
                              <div className="flex gap-2 flex-wrap items-center mb-1">
                                <span className="tag">字幕已提取</span>
                                <button className="btn-ghost py-0.5 text-xs" onClick={() => downloadText(it.title || '字幕', 'srt', it.sub!.srt || '')}>
                                  下载 SRT
                                </button>
                                <button className="btn-ghost py-0.5 text-xs" onClick={() => downloadText(it.title || '文案', 'txt', it.sub!.text || '')}>
                                  下载 TXT
                                </button>
                                <button className="btn-ghost py-0.5 text-xs" onClick={() => navigator.clipboard.writeText(it.sub!.text || '')}>
                                  复制文案
                                </button>
                              </div>
                              <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-28 overflow-auto">{it.sub.text}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {it.status === 'ok' && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button className="btn-ghost py-1 text-xs" onClick={() => downloadOne(it)}>
                          下载
                        </button>
                        <button
                          className="btn-ghost py-1 text-xs"
                          disabled={it.sub?.status === 'running'}
                          onClick={() => extractSub(i)}
                        >
                          提取字幕
                        </button>
                        <a className="btn-ghost py-1 text-xs text-center" href={`/?link=${encodeURIComponent(it.link)}`}>
                          反推
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
