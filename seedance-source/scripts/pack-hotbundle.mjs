// 打一个 JS 热更新包(B 层):只含 .next + server.js(+ public),不含 node_modules。
// 用法: node scripts/pack-hotbundle.mjs <version>
// 产出: dist-hot/web-<version>.zip 和 web-manifest.json —— 传到你的服务器/GitHub,
// 客户端 electron/config.json 的 hotUpdateManifest 指向该 manifest。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const version = Number(process.argv[2]);
if (!version) {
  console.error('用法: node scripts/pack-hotbundle.mjs <version(整数,递增)>');
  process.exit(1);
}
const root = process.cwd();
const S = path.join(root, '.next', 'standalone');
const out = path.join(root, 'dist-hot');
fs.mkdirSync(out, { recursive: true });

const zip = new AdmZip();
zip.addLocalFolder(path.join(S, '.next'), '.next');
zip.addLocalFile(path.join(S, 'server.js'));
if (fs.existsSync(path.join(S, 'public'))) zip.addLocalFolder(path.join(S, 'public'), 'public');
const zipName = `web-${version}.zip`;
zip.writeZip(path.join(out, zipName));

fs.writeFileSync(
  path.join(out, 'web-manifest.json'),
  JSON.stringify({ version, zipUrl: `REPLACE_WITH_YOUR_BASE_URL/${zipName}` }, null, 2),
);
console.log(`✅ 热更新包: dist-hot/${zipName}`);
console.log('   把 dist-hot/ 传到你的服务器,修改 web-manifest.json 里的 zipUrl 为真实地址');
