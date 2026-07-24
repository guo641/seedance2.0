'use client';
import { useEffect, useState } from 'react';
import { api, postJSON } from '@/lib/client';

export type Me = { keyMask: string } | null;

export function useMe() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const r = await api('/api/auth/me');
      setMe(r.connected ? { keyMask: r.keyMask } : null);
      setLoading(false);
    })();
  }, []);
  // quota 已废弃(BYOK 无配额),保留字段兼容旧调用
  return { me, quota: null as any, loading };
}

export default function Header({ me, tab }: { me: Me; quota?: any; tab?: string }) {
  const nav = [
    { href: '/', label: '视频分镜分析' },
    { href: '/workshop', label: '一键变原创' },
    { href: '/download', label: '解析下载' },
    { href: '/history', label: '分析历史库' },
    { href: '/speedtest', label: '测速' },
  ];
  return (
    <header className="border-b border-line sticky top-0 z-20 bg-ink/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-7">
        <a href="/" className="flex items-center gap-2 whitespace-nowrap">
          <span className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-bold">
            S
          </span>
          <span className="font-semibold tracking-tight text-gray-100">Seedance 2.0 反推</span>
        </a>
        <nav className="flex gap-1 text-sm">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                tab === n.href ? 'bg-accent/15 text-accent' : 'text-gray-400 hover:text-gray-100 hover:bg-panel2'
              }`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {me ? (
            <>
              <span className="tag" title="当前使用的秘钥">
                {me.keyMask}
              </span>
              <button
                className="btn-ghost py-1"
                onClick={async () => {
                  await postJSON('/api/auth/logout', {});
                  location.href = '/login';
                }}
              >
                退出
              </button>
            </>
          ) : (
            <a className="btn-primary py-1" href="/login">
              输入秘钥
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
