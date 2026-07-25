// electron-builder afterPack 钩子 —— 修复历史库存不进的根因。
//
// 现象:桌面版能登录、能反推,但「分析历史库」永远为空。
// 根因:Next 的 standalone 产物里带了一份 better-sqlite3 原生二进制(better_sqlite3.node),
//   它是 CI 上按【普通 Node 的 ABI】编译的;而桌面运行时用 Electron 内置 Node(ELECTRON_RUN_AS_NODE)去跑,
//   两者 ABI 不同 → require 即抛错 → 所有数据库路由 500 → 历史存不进、读不出。
//   而且 files 只含 electron/**,根 node_modules 不进包,electron-builder 的自动 rebuild 可能整个跳过。
// 解决:打包后,①用 Electron 的 ABI 显式重建根目录的 better-sqlite3(根目录有完整 C++ 源码可编译),
//   ②把重建好的 better_sqlite3.node 覆盖到打包好的 standalone 副本上。ABI 对上,历史库即正常。
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const projectDir = packager.projectDir;
  const REL = path.join('better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const src = path.join(projectDir, 'node_modules', REL);

  // Electron 版本(用于按其 ABI 重建)
  let electronVersion = '';
  try {
    electronVersion = require(path.join(projectDir, 'node_modules', 'electron', 'package.json')).version;
  } catch {}

  // ① 用 Electron ABI 重建根目录的 better-sqlite3
  try {
    const mod = require('@electron/rebuild');
    const rebuild = mod.rebuild || (mod.default && mod.default.rebuild) || mod.default;
    if (rebuild && electronVersion) {
      console.log(`[afterPack] 正在按 Electron ${electronVersion} 的 ABI 重建 better-sqlite3…`);
      await rebuild({ buildPath: projectDir, electronVersion, onlyModules: ['better-sqlite3'], force: true });
      console.log('[afterPack] better-sqlite3 重建完成');
    } else {
      console.warn('[afterPack] 未找到 @electron/rebuild 或 electron 版本,跳过重建,直接复制现有二进制');
    }
  } catch (e) {
    console.warn('[afterPack] 重建 better-sqlite3 出错(继续尝试复制):', e && e.message);
  }

  // ② 覆盖 standalone 副本
  const resourcesDir =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');
  const dest = path.join(resourcesDir, 'app', 'node_modules', REL);
  try {
    if (!fs.existsSync(src)) return console.warn('[afterPack] 根 sqlite 二进制不存在,跳过:', src);
    if (!fs.existsSync(path.dirname(dest)))
      return console.warn('[afterPack] standalone 无 better-sqlite3 目录,跳过:', path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log('[afterPack] ✅ 已用 Electron-ABI 的 better_sqlite3.node 覆盖 standalone 副本 →', dest);
  } catch (e) {
    console.warn('[afterPack] 覆盖 sqlite 二进制失败:', e && e.message);
  }
};
