'use client';
import { useEffect, useState } from 'react';
import { use } from 'react';
import { api } from '@/lib/client';

export default function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/api/qr-download?token=${token}`).then((r) => {
      if (r.success) setText(r.data.text);
      else setErr(r.error || '链接已失效');
    });
  }, [token]);
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="font-bold mb-3">分镜提示词预览</h1>
      {err ? (
        <p className="text-red-400">{err}</p>
      ) : (
        <>
          <pre className="whitespace-pre-wrap text-sm card p-4">{text || '加载中...'}</pre>
          {text && (
            <button className="btn-primary mt-3" onClick={() => navigator.clipboard.writeText(text)}>
              复制全部
            </button>
          )}
        </>
      )}
    </main>
  );
}
