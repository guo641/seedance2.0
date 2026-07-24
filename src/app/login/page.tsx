'use client';
import { useEffect, useState } from 'react';
import { api, postJSON } from '@/lib/client';

const KEY_STORE = 'seedance:secret'; // 记住用户秘钥(本机,供下次自动登录)

export default function KeyGatePage() {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [autoLogging, setAutoLogging] = useState(true); // 进页先尝试自动登录,默认 true 避免闪现表单

  // 打开时:①若已有有效会话(Cookie)直接进;②否则若本机记住了秘钥,自动验证并进入
  useEffect(() => {
    (async () => {
      // ① 已登录过且会话仍有效(Cookie 与端口无关、可跨重启持久化)→ 直接进
      try {
        const me = await api('/api/auth/me');
        if (me?.connected) {
          window.location.href = '/';
          return;
        }
      } catch {}
      // ② 用本机记住的秘钥自动验证
      const saved = typeof window !== 'undefined' ? localStorage.getItem(KEY_STORE) : null;
      if (!saved) {
        setAutoLogging(false);
        return;
      }
      setSecret(saved);
      try {
        const r = await postJSON('/api/auth', { key: saved.trim() });
        if (r.success) {
          window.location.href = '/';
          return;
        }
        localStorage.removeItem(KEY_STORE);
        setErr('已保存的秘钥已失效,请重新输入');
      } catch {
        setErr('自动登录失败,请手动验证');
      } finally {
        setAutoLogging(false);
      }
    })();
  }, []);

  async function verify() {
    setErr('');
    const k = secret.trim();
    if (!k) return setErr('请输入你的秘钥');
    setBusy(true);
    try {
      const r = await postJSON('/api/auth', { key: k });
      if (!r.success) return setErr(r.message || '秘钥无效,请检查后重试');
      localStorage.setItem(KEY_STORE, k); // 记住,下次自动登录
      window.location.href = '/';
    } catch {
      setErr('网络错误,请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 text-center">
        {/* 醒目居中标题 */}
        <div className="flex flex-col items-center mb-6">
          <span className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center text-white text-xl font-bold mb-3">
            S
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-100">Seedance 2.0 反推</h1>
          <p className="text-sm text-gray-500 mt-2">
            {autoLogging ? '正在用已保存的秘钥自动登录…' : '请输入你的秘钥,验证有效后进入系统'}
          </p>
        </div>

        <div className="space-y-3 text-left">
          <input
            className="input text-center"
            type="password"
            placeholder="在此粘贴你的秘钥"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            disabled={autoLogging}
            autoFocus
          />
          {err && <p className="text-sm text-red-400 text-center">{err}</p>}
          <button className="btn-primary w-full" onClick={verify} disabled={busy || autoLogging}>
            {autoLogging ? '自动登录中…' : busy ? '验证秘钥中...' : '验证秘钥并进入'}
          </button>
          <p className="text-xs text-gray-600 text-center">
            秘钥仅保存在你本机(用于自动登录和调用你自己的额度),服务器不存储。点右上角「退出」可清除记住的秘钥。
          </p>
        </div>
      </div>
    </div>
  );
}
