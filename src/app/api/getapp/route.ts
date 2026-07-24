import fs from 'node:fs';

// 临时:免登录下载源码包(供用户拿去 GitHub 打包桌面客户端)
const ZIP = '/home/claudeuser/seedance-source.zip';

export async function GET() {
  if (!fs.existsSync(ZIP)) return new Response('源码包不存在', { status: 404 });
  // 用一次性读入的 Buffer 返回,避免客户端中断下载时 ReadableStream 已关闭抛出未捕获异常、把整个服务进程带崩。
  const buf = fs.readFileSync(ZIP);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(buf.length),
      'Content-Disposition': "attachment; filename*=UTF-8''seedance-source.zip",
    },
  });
}
