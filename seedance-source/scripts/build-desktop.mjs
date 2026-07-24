// 把 `next build` 产出的 standalone 处理成自包含目录(供 Electron extraResources 打包)。
// 步骤:复制 .next/static、public、并补上 ffmpeg 二进制(standalone trace 会漏掉它)。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const S = path.join(root, '.next', 'standalone');

if (!fs.existsSync(path.join(S, 'server.js'))) {
  console.error('未找到 .next/standalone/server.js,请先执行 `next build`(next.config 已开启 output:standalone)');
  process.exit(1);
}

// 1) 静态资源
fs.cpSync(path.join(root, '.next', 'static'), path.join(S, '.next', 'static'), { recursive: true });
// 2) public(若有)
if (fs.existsSync(path.join(root, 'public')))
  fs.cpSync(path.join(root, 'public'), path.join(S, 'public'), { recursive: true });

// 3) ffmpeg 二进制(trace 只带了 index.js,没带二进制)
try {
  const ffmpegBin = require('ffmpeg-static'); // 绝对路径
  const dest = path.join(S, 'node_modules', 'ffmpeg-static', path.basename(ffmpegBin));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(ffmpegBin, dest);
  fs.chmodSync(dest, 0o755);
  console.log('已补 ffmpeg 二进制 →', dest);
} catch (e) {
  console.warn('复制 ffmpeg 二进制失败(需手动补):', e.message);
}

console.log('✅ standalone 处理完成:', S);
