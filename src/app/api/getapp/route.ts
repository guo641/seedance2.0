import fs from 'node:fs';

// 临时:免登录下载源码包(供用户拿去 GitHub 打包桌面客户端)
const ZIP = '/home/claudeuser/seedance-source.zip';

export async function GET() {
  if (!fs.existsSync(ZIP)) return new Response('源码包不存在', { status: 404 });
  const stat = fs.statSync(ZIP);
  return new Response(fs.createReadStream(ZIP) as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(stat.size),
      'Content-Disposition': "attachment; filename*=UTF-8''seedance-source.zip",
    },
  });
}
