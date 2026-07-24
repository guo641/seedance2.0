'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * B 层 JS 热更新:只更新 Next 的应用代码(.next + server.js),node_modules 用 junction 指回
 * 已安装的原生依赖,所以热更包很小(几 MB),改提示词/逻辑/UI 免重装。
 *
 * 远端需要提供:
 *   manifest(JSON): { "version": 3, "zipUrl": "https://.../web-3.zip" }
 *   zip 内容:standalone 的 .next/ 与 server.js(以及 public/,若有)
 * manifest 地址来自 env HOTUPDATE_MANIFEST 或 electron/config.json 的 hotUpdateManifest。
 */
function manifestUrl() {
  if (process.env.HOTUPDATE_MANIFEST) return process.env.HOTUPDATE_MANIFEST;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    return cfg.hotUpdateManifest || '';
  } catch {
    return '';
  }
}

function localVersion(hotDir) {
  try {
    return Number(fs.readFileSync(path.join(hotDir, 'version.txt'), 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

/** 把 node_modules 以 junction(Windows 免管理员)/symlink 方式指回安装目录 */
function linkNodeModules(hotDir, resApp) {
  const link = path.join(hotDir, 'node_modules');
  const target = path.join(resApp, 'node_modules');
  try {
    if (fs.existsSync(link)) return;
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    console.warn('[hotupdate] 链接 node_modules 失败,回退复制:', e?.message);
    // 回退:极端情况下复制(慢但可用)。生产可换 fs.cpSync
  }
}

async function checkHotUpdate(hotDir, resApp) {
  const url = manifestUrl();
  if (!url) return; // 未配置热更新地址,跳过

  const manifest = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
  const remote = Number(manifest.version) || 0;
  if (remote <= localVersion(hotDir)) return; // 已是最新

  const AdmZip = require('adm-zip');
  const buf = Buffer.from(await (await fetch(manifest.zipUrl)).arrayBuffer());
  const tmpZip = path.join(os.tmpdir(), `web-${remote}.zip`);
  fs.writeFileSync(tmpZip, buf);

  // 清空并解压到 hotDir
  fs.rmSync(hotDir, { recursive: true, force: true });
  fs.mkdirSync(hotDir, { recursive: true });
  new AdmZip(tmpZip).extractAllTo(hotDir, true);
  fs.rmSync(tmpZip, { force: true });

  linkNodeModules(hotDir, resApp);
  fs.writeFileSync(path.join(hotDir, 'version.txt'), String(remote));
  console.log(`[hotupdate] 已下载 JS 热更新 v${remote},下次启动生效`);
}

module.exports = { checkHotUpdate };
