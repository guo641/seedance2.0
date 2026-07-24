'use client';
import { useEffect, useRef, useState } from 'react';
import Header, { useMe } from '@/components/Header';
import StoryboardView from '@/components/StoryboardView';
import VariantPanel from '@/components/VariantPanel';
import { api, postJSON, pollTask } from '@/lib/client';

type Mode = 'subtitle' | 'withsub' | 'douyin' | 'commentary';

export default function Home() {
  const { me, quota, loading } = useMe();
  const [mode, setMode] = useState<Mode>('douyin');
  const [models, setModels] = useState<any[]>([]);
  const [model, setModel] = useState('');
  const [seg, setSeg] = useState(12);
  const [styles, setStyles] = useState<{ id: string; label: string }[]>([]);
  const [style, setStyle] = useState(''); // 选中的预设 id;'__custom__' 表示自定义
  const [customStyle, setCustomStyle] = useState('');

  const [douyin, setDouyin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [commentary, setCommentary] = useState('');
  const [commTotal, setCommTotal] = useState(''); // 解说文案已知总时长(可选)

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0); // 实时秒
  const [finalTime, setFinalTime] = useState<number | null>(null); // 完成耗时
  const startRef = useRef(0);

  // 计时:反推期间每秒更新
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  // 从「解析下载」页跳转过来:?link= 预填抖音链接并切到抖音Tab
  useEffect(() => {
    const link = new URLSearchParams(window.location.search).get('link');
    if (link) {
      setMode('douyin');
      setDouyin(link);
    }
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;

  useEffect(() => {
    api('/api/models').then((r) => {
      if (r.success) {
        setModels(r.data.models);
        setModel((m) => m || r.data.default); // 不覆盖已从上次结果恢复的模型选择
        setStyles(r.data.styles || []);
      }
    });
  }, []);

  const canUse = !!me; // BYOK:连接了 key 即可用

  // 后台反推任务是「触发即分离」的:即使切走页面(整页刷新),服务端仍在跑。
  // 这里把进行中的 taskId 存到 localStorage,回到本页时自动重新接上,不再「切走就丢」。
  type Running = {
    taskId: string;
    startedAt: number;
    mode: Mode;
    model: string;
    seg: number;
    sourceUrl?: string;
    videoUrl?: string;
  };
  const LS_KEY = 'seedance:running:analyze'; // 进行中的任务
  const LR_KEY = 'seedance:lastresult'; // 上一次完成的结果(切走再回来仍保留,直到重新推理)

  // 轮询某个后台反推任务直到完成,并做结果展示 + 存历史(新反推与「恢复」共用)
  async function finishAnalyze(r: Running) {
    const done = await pollTask((id) => `/api/trigger-analyze/status?taskId=${id}`, r.taskId, {
      onTick: (x) => x.progress && setProgress(x.progress),
    });
    const storyboard = done.result || done.storyboard;
    if (!storyboard || !storyboard.trim()) throw new Error('反推结果为空,请重试或更换反推模型');
    setResult(storyboard);
    // 记住这次结果:切到别的功能再回来仍然在,直到下次重新推理才被替换
    try {
      localStorage.setItem(LR_KEY, JSON.stringify({ storyboard, model: r.model, seg: r.seg, mode: r.mode }));
    } catch {}
    // 生成标题/摘要 + 存历史库属于「锦上添花」,失败不该盖掉已经拿到的分镜结果
    try {
      const meta = await postJSON('/api/generate-story-meta', { storyboard, model: r.model });
      const saved = await postJSON('/api/analysis-history', {
        storyboard,
        mode: r.mode,
        model: r.model,
        sourceUrl: r.sourceUrl,
        videoUrl: r.videoUrl,
        segmentSeconds: r.seg,
        title: meta?.data?.title,
        tags: meta?.data?.tags,
        summary: meta?.data?.summary,
      });
      if (saved.success) setSavedId(saved.data.id);
    } catch (e) {
      console.warn('保存历史失败(不影响结果展示):', e);
    }
  }

  // 进本页时:①若有未完成的后台反推,自动接上继续;②否则恢复上一次完成的结果
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    let r: Running | null = null;
    if (raw) {
      try {
        r = JSON.parse(raw);
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
    // 没有进行中的任务 → 尝试恢复上一次的结果,让它在切页后依然显示
    if (!r?.taskId || Date.now() - (r.startedAt || 0) > 25 * 60 * 1000) {
      if (raw) localStorage.removeItem(LS_KEY);
      try {
        const last = localStorage.getItem(LR_KEY);
        if (last) {
          const lr = JSON.parse(last);
          if (lr?.storyboard) {
            setResult(lr.storyboard);
            if (lr.model) setModel(lr.model);
            if (lr.seg) setSeg(lr.seg);
            if (lr.mode) setMode(lr.mode);
          }
        }
      } catch {}
      return;
    }
    startRef.current = r.startedAt || Date.now();
    setBusy(true);
    setProgress('继续上次反推…');
    (async () => {
      try {
        await finishAnalyze(r!);
      } catch (e: any) {
        setErr(e?.message || '任务失败');
      } finally {
        setFinalTime(Math.floor((Date.now() - startRef.current) / 1000));
        setBusy(false);
        setProgress('');
        localStorage.removeItem(LS_KEY);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setErr('');
    setResult('');
    setSavedId(null);
    setFinalTime(null);
    if (typeof window !== 'undefined') localStorage.removeItem(LR_KEY); // 开始新推理才清掉旧结果
    if (!me) return setErr('请先输入你的秘钥');
    startRef.current = Date.now();
    setElapsed(0);
    setBusy(true);
    try {
      // 电影解说文案 → 画面提示词(纯文本,不走视频/字幕)
      if (mode === 'commentary') {
        if (!commentary.trim()) throw new Error('请粘贴电影解说文案');
        setProgress('解析解说文案、反推画面中...');
        const trig = await postJSON('/api/trigger-analyze-url', {
          commentary,
          commentary_total: commTotal ? Number(commTotal) : undefined,
          model,
          segment_duration: seg,
          style: style === '__custom__' ? customStyle.trim() : style,
        });
        if (!trig.success) throw new Error(trig.error || '触发失败');
        const r: Running = {
          taskId: trig.taskId,
          startedAt: startRef.current,
          mode: 'commentary',
          model,
          seg,
          sourceUrl: '电影解说文案',
        };
        localStorage.setItem(LS_KEY, JSON.stringify(r));
        await finishAnalyze(r);
        return;
      }

      let videoUrl: string | undefined;
      let sub = subtitle;

      // 1) 取得视频地址
      if (mode === 'douyin') {
        if (!douyin.trim()) throw new Error('请粘贴抖音分享链接或文案');
        setProgress('解析抖音链接...');
        const r = await api(`/api/resolve-douyin?url=${encodeURIComponent(douyin)}`);
        if (!r.success) throw new Error(r.error || '抖音解析失败');
        videoUrl = r.data.videoUrl;
      } else {
        if (!file) throw new Error('请先选择视频文件');
        setProgress('上传视频中...');
        const fd = new FormData();
        fd.append('file', file);
        const up = await api('/api/upload', { method: 'POST', body: fd });
        if (!up.success) throw new Error(up.error || '上传失败');
        videoUrl = up.data.videoUrl;
      }

      // 2) 智能加字幕模式:先生成字幕
      if (mode === 'subtitle') {
        setProgress('生成字幕中...');
        const t = await postJSON('/api/generate-subtitle', { video_url: videoUrl });
        if (!t.success) throw new Error(t.error || '触发字幕任务失败');
        const s = await pollTask((id) => `/api/generate-subtitle/status?taskId=${id}`, t.taskId, {
          onTick: (x) => x.progress && setProgress(x.progress),
        });
        sub = s.subtitle || '';
      }

      // 3) 触发分镜反推
      setProgress('反推 Seedance 2.0 分镜中...');
      const trig = await postJSON('/api/trigger-analyze-url', {
        video_url: videoUrl,
        subtitle: sub || undefined,
        model,
        segment_duration: seg,
        style: style === '__custom__' ? customStyle.trim() : style,
      });
      if (!trig.success) throw new Error(trig.error || '触发分镜任务失败');
      const r: Running = {
        taskId: trig.taskId,
        startedAt: startRef.current,
        mode,
        model,
        seg,
        sourceUrl: mode === 'douyin' ? douyin : file?.name,
        videoUrl,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(r));
      // 4) 轮询到完成并自动存历史库(与「恢复」共用同一逻辑)
      await finishAnalyze(r);
    } catch (e: any) {
      setErr(e?.message || '分析失败');
    } finally {
      setFinalTime(Math.floor((Date.now() - startRef.current) / 1000));
      setBusy(false);
      setProgress('');
      if (typeof window !== 'undefined') localStorage.removeItem(LS_KEY);
    }
  }

  const tabs: { key: Mode; label: string; sub: string }[] = [
    { key: 'subtitle', label: '智能加字幕分镜', sub: '无字幕视频,自动转写后反推' },
    { key: 'withsub', label: '带字幕视频分镜', sub: '视频已含字幕,直接反推' },
    { key: 'douyin', label: '抖音链接', sub: '粘贴分享链接/文案' },
    { key: 'commentary', label: '电影解说文案', sub: '粘贴解说文案,反推画面提示词' },
  ];

  return (
    <>
      <Header me={me} quota={quota} tab="/" />
      <main className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-6">
        {/* 左:输入 */}
        <section className="card p-6 space-y-5">
          <div>
            <div className="field-label mb-1">INPUT / 输入</div>
            <h1 className="text-lg font-bold tracking-tight">视频分镜分析</h1>
            <p className="text-sm text-gray-500">输入视频,AI 自动反推可回喂 Seedance 2.0 的分镜提示词</p>
            <div className="rule mt-3" />
          </div>

          <div className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`flex-1 text-xs px-2 py-2 rounded-lg border ${mode === t.key ? 'border-accent bg-accent/10 text-accent' : 'border-line text-gray-400'}`}
                title={t.sub}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'commentary' ? (
            <>
              <textarea
                className="input h-36"
                placeholder="粘贴电影解说文案（第三人称旁白）,例如：小帅是个落魄程序员，直到他在地铁上捡到一部会说话的手机……"
                value={commentary}
                onChange={(e) => setCommentary(e.target.value)}
              />
              <label className="text-sm block">
                <span className="field-label">文案时长(秒) · 可选</span>
                <input
                  type="number"
                  className="input mt-1"
                  min={2}
                  max={1200}
                  placeholder="知道就填,更准（如 50）;不填按字数估算"
                  value={commTotal}
                  onChange={(e) => setCommTotal(e.target.value)}
                />
              </label>
            </>
          ) : mode === 'douyin' ? (
            <textarea
              className="input h-24"
              placeholder="粘贴抖音分享链接或完整分享文案"
              value={douyin}
              onChange={(e) => setDouyin(e.target.value)}
            />
          ) : (
            <label className="block border-2 border-dashed border-line rounded-xl p-6 text-center cursor-pointer hover:border-accent">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.mkv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <span className="text-sm">{file.name}（{(file.size / 1024 / 1024).toFixed(1)}MB）</span>
              ) : (
                <span className="text-sm text-gray-400">
                  点击或拖拽视频文件到此处,支持 mp4/mov/webm,最大 200MB
                </span>
              )}
            </label>
          )}

          {mode === 'withsub' && (
            <textarea
              className="input h-20"
              placeholder="（可选）粘贴已有字幕/台词,提升反推准确度"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="field-label">反推模型</span>
              <select className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.vision ? '' : ' · 需字幕'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="field-label">分段时长(秒)</span>
              <input
                type="number"
                className="input mt-1"
                min={2}
                max={60}
                value={seg}
                onChange={(e) => setSeg(Number(e.target.value))}
              />
              {mode === 'commentary' && (
                <span className="text-[11px] text-gray-500">每段秒数;段内画面数按文案内容动态切(2~5个)</span>
              )}
            </label>
          </div>

          {/* 输出风格 */}
          <div className="text-sm">
            <span className="field-label">输出风格</span>
            <select
              className="input mt-1"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="__custom__">自定义…</option>
            </select>
            {style === '__custom__' && (
              <input
                className="input mt-2"
                placeholder="自定义风格,例如：王家卫电影感 / 宫崎骏动画 / 黑白默片"
                value={customStyle}
                onChange={(e) => setCustomStyle(e.target.value)}
              />
            )}
          </div>

          <button className="btn-primary w-full" onClick={run} disabled={busy || loading}>
            {busy ? `${progress || '分析中'}… ⏱ ${fmt(elapsed)}` : '开始反推分镜'}
          </button>
          {!me && (
            <p className="text-sm text-yellow-400">请先在秘钥页输入你的秘钥</p>
          )}
          {err && <p className="text-sm text-red-400">{err}</p>}
        </section>

        {/* 右:结果 */}
        <section className="card p-6">
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="field-label mb-1">OUTPUT / 结果</div>
                <h2 className="font-bold tracking-tight">分镜分析结果</h2>
              </div>
              {finalTime != null && result && <span className="tag">耗时 {fmt(finalTime)}</span>}
            </div>
            <div className="rule mt-3" />
          </div>
          {result ? (
            <>
              <StoryboardView text={result} />
              {savedId && (
                <p className="mt-3 text-xs text-green-400">
                  已保存到历史库 · <a className="underline" href="/history">查看</a>
                </p>
              )}
              {/* 反推后直接在此生成变体(融合提示词工坊) */}
              <div className="mt-4">
                <VariantPanel source={result} model={model} />
              </div>
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
              {busy ? (
                <>
                  <div className="animate-pulse text-gray-300">{progress || '生成中...'}</div>
                  <div className="tag">{fmt(elapsed)}</div>
                </>
              ) : (
                <span className="field-label">结果将显示在这里</span>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
