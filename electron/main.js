'use strict';
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
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
    // 载入首页:middleware 会在有有效会话(Cookie)时放行,无会话才跳 /login。
    // 这样重启后只要会话没过期就直接进,不用每次重输秘钥。
    await win.loadURL(base + '/');
  } catch (e) {
    dialog.showErrorBox('启动失败', String(e?.message || e));
  }
}

// ── C 层:整包自动更新(electron-updater + GitHub Releases)──
let manualCheck = false; // 区分「开机静默检查」与「用户手动点检查更新」
function setupAutoUpdate() {
  if (!app.isPackaged) return; // 只有安装版才有自动更新
  let updater;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch {
    return;
  }
  updater.autoDownload = true; // 发现新版就后台下
  updater.autoInstallOnAppQuit = true; // 用户没点重启也会在下次退出时装上

  updater.on('update-available', (info) => {
    if (win)
      dialog.showMessageBox(win, {
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 v${info.version}，正在后台自动下载…`,
        detail: '下载完成后会提示你一键重启安装,期间可以继续使用。',
        buttons: ['好的'],
      });
  });
  updater.on('update-not-available', () => {
    if (manualCheck && win)
      dialog.showMessageBox(win, { type: 'info', title: '检查更新', message: '当前已是最新版本。', buttons: ['好的'] });
    manualCheck = false;
  });
  updater.on('error', (err) => {
    if (manualCheck && win)
      dialog.showMessageBox(win, {
        type: 'error',
        title: '检查更新失败',
        message: '检查更新时出错,请稍后再试。',
        detail: String(err?.message || err),
        buttons: ['好的'],
      });
    manualCheck = false;
  });
  updater.on('update-downloaded', (info) => {
    if (!win) return;
    dialog
      .showMessageBox(win, {
        type: 'question',
        title: '更新已就绪',
        message: `新版本 v${info.version} 已下载完成`,
        detail: '点「立即重启」马上更新,或选「稍后」——下次退出软件时会自动安装。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) updater.quitAndInstall();
      });
  });

  global.__checkForUpdates = (fromUser) => {
    manualCheck = !!fromUser;
    updater.checkForUpdates().catch((e) => {
      manualCheck = false;
      console.warn('[updater]', e?.message);
    });
  };

  // 开机静默检查一次
  global.__checkForUpdates(false);
}

// 顶部菜单:含「检查更新」
function buildMenu() {
  const template = [
    { label: '文件', submenu: [{ role: 'quit', label: '退出' }] },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新…',
          click: () => {
            if (global.__checkForUpdates) global.__checkForUpdates(true);
            else if (win)
              dialog.showMessageBox(win, { type: 'info', message: '开发调试版不支持自动更新,安装版才可用。', buttons: ['好的'] });
          },
        },
        { label: '刷新页面', click: () => win && win.reload() },
        { type: 'separator' },
        {
          label: '关于',
          click: () =>
            win &&
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于',
              message: `Seedance 2.0 反推  v${app.getVersion()}`,
              detail: '作者:天辰   微信:ChatGPT02468',
              buttons: ['好的'],
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  buildMenu();
  // B 层:后台检查并下载 JS 热更新(下次启动生效),失败不阻塞
  checkHotUpdate(HOT_DIR, RES_APP).catch((e) => console.warn('[hotupdate]', e?.message));
  await createWindow();
  // C 层:窗口就绪后再挂自动更新(弹窗需要 win)
  setupAutoUpdate();
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
