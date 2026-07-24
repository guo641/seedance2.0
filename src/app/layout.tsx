import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seedance 2.0 反推',
  description: '输入视频链接,AI 自动反推 Seedance 2.0 分镜提示词',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <footer className="border-t border-line mt-8">
          <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between text-xs text-gray-500">
            <span className="tracking-tight">Seedance 2.0 反推</span>
            <span className="field-label">作者 天辰 · 微信 ChatGPT02468</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
