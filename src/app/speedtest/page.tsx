'use client';
import { useState } from 'react';
import Header, { useMe } from '@/components/Header';
import { api } from '@/lib/client';

type Stat = { id: string; label: string; ok: boolean; ms: number; error?: string; reply?: string };

export default function SpeedTest() {
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stat[] | null>(null);

  async function run() {
    setBusy(true);
    setStats(null);
    const r = await api('/api/test-models');
    if (r.success) setStats(r.data);
    setBusy(false);
  }

  return (
    <>
      <Header me={me} tab="/speedtest" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6 space-y-4">
          <div>
            <div className="field-label mb-1">模型测速</div>
            <h1 className="text-lg font-bold">测试反推模型是否可用</h1>
            <p className="text-sm text-gray-500">用你当前的秘钥,逐个连接反推模型,显示可用性与延迟</p>
            <div className="rule mt-3" />
          </div>

          <button className="btn-primary w-full" onClick={run} disabled={busy}>
            {busy ? '测速中...' : '开始测速'}
          </button>

          {stats && (
            <div className="space-y-2">
              {stats.map((m) => (
                <div key={m.id} className="flex items-center justify-between border border-line rounded-lg px-3 py-2 text-sm">
                  <span className="truncate">{m.label}</span>
                  {m.ok ? (
                    <span className="text-accent2 whitespace-nowrap">✓ 可用 · {m.ms}ms</span>
                  ) : (
                    <span className="text-red-400 whitespace-nowrap" title={m.error}>
                      ✕ 不可用
                    </span>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-600">延迟为一次极小请求的往返耗时,仅供参考。</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
