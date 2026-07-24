# 桌面客户端(Windows)· 方案 C+B

把这个 Next.js 应用打成 **Windows 桌面客户端**,支持:

- **C 层 · 整包自动更新**(electron-updater):启动检测新版 → 后台下载增量 → 重启生效。能更新一切(含 ffmpeg 等原生)。
- **B 层 · JS 热更新**:只更新 `.next`+`server.js`(几 MB),`node_modules` 用 junction 指回安装目录。改提示词/逻辑/UI **免重装**,下次启动即生效。

架构:Electron 主进程用内置 Node 跑 Next 的 `standalone` 服务(本地随机端口),窗口加载它;数据写到用户可写目录 `%APPDATA%/Seedance2.0反推/data`。

---

## 一、准备(在 Windows 上,需装 Node 18+ 与构建工具)

```bash
npm install                      # 装依赖(含 electron / electron-builder / electron-updater / adm-zip)
```
> better-sqlite3 是原生模块,electron-builder 打包时会用 `npmRebuild` 自动按 Electron 的 ABI 重建。首次构建需要 VS Build Tools(Windows)或 Xcode(mac)。

## 二、本地跑桌面版(调试)
```bash
npm run desktop:dev
```
（= `next build` + 处理 standalone + `electron .`）

## 三、打出安装包(.exe)
```bash
npm run dist                     # 产出 dist-desktop/ 里的 NSIS 安装包(.exe)
```

## 四、配置自动更新(C 层)
1. 编辑 `package.json` → `build.publish[0].url` 改成你放更新文件的地址(你自己的服务器,或换成 GitHub Releases:`{"provider":"github","owner":"你","repo":"你的repo"}`)。
2. 每次发版:提升 `package.json` 的 `version`,执行:
   ```bash
   npm run dist:publish           # 构建并上传安装包+latest.yml 到该地址
   ```
3. 客户端启动会自动检测并更新。

## 五、配置 JS 热更新(B 层)
1. 编辑 `electron/config.json` → `hotUpdateManifest` 填你的 manifest 地址(见下)。
2. 每次只改了 JS(提示词/逻辑/UI)想快速热更:
   ```bash
   npm run desktop:prepare        # 重新 build + 处理 standalone
   npm run hotbundle 3            # 版本号递增(整数),产出 dist-hot/web-3.zip + web-manifest.json
   ```
3. 把 `dist-hot/web-3.zip` 传到你的服务器,改 `web-manifest.json` 里的 `zipUrl` 为真实地址,再把 `web-manifest.json` 也传上去(地址与 `hotUpdateManifest` 一致)。
4. 客户端下次启动检测到更高 `version` 就下载并生效,**无需重装**。

> 注意:B 层只更新 JS。如果改动引入了新的原生依赖(极少),必须走 C 层整包更新。

---

## 目录/文件
- `electron/main.js` — 主进程:起 standalone 服务、开窗口、接 auto-updater + hot-update
- `electron/hotupdate.js` — B 层热更新逻辑
- `electron/config.json` — 热更新 manifest 地址
- `scripts/build-desktop.mjs` — 处理 standalone(补 static/ffmpeg 二进制)
- `scripts/pack-hotbundle.mjs` — 打 JS 热更新包
- `package.json` → `build` — electron-builder 配置(win NSIS、asarUnpack `*.node`、extraResources `app`)

## 常见坑
- **better-sqlite3 崩溃**:ABI 不匹配。确保 `npmRebuild:true`(已配),或手动 `npx electron-builder install-app-deps` 后再打包。
- **ffmpeg 找不到**:`scripts/build-desktop.mjs` 会把二进制补进 standalone;若仍缺,检查 `node_modules/ffmpeg-static`。
- **必剪 ASR 免费**,反推走用户自己的秘钥,数据按秘钥哈希隔离——桌面版逻辑与 web 版完全一致。
