'use client';
import { useState } from 'react';
import { postJSON } from '@/lib/client';

export default function KeyGatePage() {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function verify() {
    setErr('');
    if (!secret.trim()) return setErr('请输入你的秘钥');
    setBusy(true);
    try {
      // 用秘钥连接中转做有效性验证(中转地址用默认,前台隐藏)
      const r = await postJSON('/api/auth', { key: secret.trim() });
      if (!r.success) return setErr(r.message || '秘钥无效,请检查后重试');
      window.location.href = '/'; // 有效 → 直接进入工作界面
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
          <p className="text-sm text-gray-500 mt-2">请输入你的秘钥,验证有效后进入系统</p>
        </div>

        <div className="space-y-3 text-left">
          <input
            className="input text-center"
            type="password"
            placeholder="在此粘贴你的秘钥"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            autoFocus
          />
          {err && <p className="text-sm text-red-400 text-center">{err}</p>}
          <button className="btn-primary w-full" onClick={verify} disabled={busy}>
            {busy ? '验证秘钥中...' : '验证秘钥并进入'}
          </button>
          <p className="text-xs text-gray-600 text-center">
            秘钥仅保存在你浏览器的加密 Cookie 里,用于调用你自己的额度,服务器不存储。
          </p>
        </div>
      </div>
    </div>
  );
}
