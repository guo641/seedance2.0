'use strict';
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { checkHotUpdate } = require('./hotupdate');

let serverProc = null;
let win = null;

// ── 路径 ──
// 打包后 Next standalone 产物放在 resources/app(extraResources),开发时用项目根 .next/standalone
const isDev = !app.isPackaged;
const RES_APP = isDev
  ? path.join(__dirname, '..', '.next', 'standalone')
  : path.join(process.resourcesPath, 'app');
const DATA_DIR = path.join(app.getPath('userData'), 'data'); // 可写数据目录
const HOT_DIR = path.join(app.getPath('userData'), 'web'); // JS 热更新覆盖目录

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

async function startServer() {
  // B 层:若热更新目录里有更新的 web 版本,优先用它,否则用内置 RES_APP
  const webDir = fs.existsSync(path.join(HOT_DIR, 'server.js')) ? HOT_DIR : RES_APP;
  const port = await freePort();

  serverProc = spawn(process.execPath, [path.join(webDir, 'server.js')], {
    cwd: webDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // 用 Electron 内置的 Node 跑 Next 服务
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      DATA_DIR, // 数据写到可写目录
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });
  serverProc.stdout.on('data', (d) => console.log('[next]', d.toString().trim()));
  serverProc.stderr.on('data', (d) => console.error('[next]', d.toString().trim()));

  // 等端口就绪
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const ok = await fetch(base + '/login').then((r) => r.ok).catch(() => false);
      if (ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('本地服务启动超时');
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#16181d',
    title: 'Seedance 2.0 反推',
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  // 外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    const base = await startServer();
    await win.loadURL(base + '/login');
  } catch (e) {
    dialog.showErrorBox('启动失败', String(e?.message || e));
  }
}

app.whenReady().then(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // B 层:后台检查并下载 JS 热更新(下次启动生效),失败不阻塞
  checkHotUpdate(HOT_DIR, RES_APP).catch((e) => console.warn('[hotupdate]', e?.message));
  // C 层:整包自动更新(electron-updater),仅打包后启用
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch {}
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', () => {
  if (serverProc) serverProc.kill();
});
