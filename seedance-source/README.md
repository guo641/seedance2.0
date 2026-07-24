# 视频分镜分析工具 · Seedance 2.0 提示词反推（自建复刻版）

输入抖音链接或上传视频 → AI 反推出可回喂 **Seedance 2.0** 重新生成该视频的分镜提示词。
后端通过 **yunwu.ai 中转站**（OpenAI 兼容）调用多种反推模型。Next.js 全栈,SQLite 存储。

## 快速开始

```bash
cp .env.example .env      # 填入你的 yunwu key(YUNWU_API_KEY)
npm install
npm run build && npm start # 或 npm run dev
# 打开 http://localhost:3000
```

## 关键配置（.env）

| 变量 | 说明 |
|---|---|
| `YUNWU_API_KEY` | 你的 yunwu.ai 密钥（必填） |
| `YUNWU_BASE_URL` | 默认 `https://yunwu.ai/v1` |
| `ASR_MODEL` | 字幕转写模型,默认 `whisper-1` |
| `AUTH_SECRET` | JWT 签名密钥,改成随机长串 |
| `SUPERADMIN_USER/PASS` | 超管后台账号,首次登录自动创建 superadmin |
| `DEFAULT_QUOTA` | 新用户默认次数（原程序=0,靠管理员充值） |
| `SEGMENT_SECONDS` | 每段最大时长,默认 12 |
| `MAX_FRAMES` | 抽帧数上限,默认 16 |

## 反推模型（「反推模型有多种」）

当前预置(`src/lib/models.ts`,均多模态):
- `gemini-3.1-pro-preview`（默认）
- `gemini-2.5-pro`
- `gpt-5.5`

模型 ID 直接透传给 yunwu.ai;增删改这里即可,前端下拉自动读取。

## 抖音/多平台解析

复用 shuiying.nxux.cn 背后的 `api.bugpk.com`：`GET /api/douyin?url=<分享链接>`
→ `{code:200,data:{url(无水印直链),title,cover,images,...}}`。
`src/lib/douyin.ts` 已支持 douyin/快手/B站/小红书/头条端点,base 可用 `DOUYIN_API_BASE` 覆盖。

## 核心流程

```
视频/抖音链接
  → resolve-douyin(解析直链) / upload(上传)
  → [可选] generate-subtitle(抽音轨→ASR转写)
  → trigger-analyze-url(抽关键帧 + 字幕 → yunwu 视觉模型 → Seedance 2.0 分镜)
  → 轮询 status → 结果 + 自动存历史库(generate-story-meta 生成标题/标签)
```

## 功能对照（复刻自原程序）

- 三种输入:智能加字幕分镜 / 带字幕视频分镜 / 抖音链接
- 反推模型多选 + 分段时长可调
- 时长调整 8 档(智能缩短·2/3·1/2·1/3 / 智能增加·1.5x·2x·3x)
- 提示词工坊:TXT 生成 + 多维度变体洗稿(场景/服装/台词/镜头/时长)+ 台词提取
- 历史库 / 收藏夹 / 文件夹 / 跨库移动复制 / 二维码分享(30 分钟有效)
- 账号体系:注册登录(JWT)、三级角色(member/admin/superadmin)、按次配额
- 超管后台:用户列表、充值、设不限次、改角色

## 目录

```
src/lib/       db, auth, yunwu(中转客户端), models(模型注册表),
               prompts(Seedance反推系统提示词+8档时长指令+变体),
               video(ffmpeg抽帧/抽音轨), pipeline(编排), tasks(异步轮询), douyin
src/app/api/   30 个路由(见 build 输出)
src/app/       login / (主页) / history / workshop / superadmin / share
```

## 说明 / 局限

- 抖音解析(`src/lib/douyin.ts`)给的是可用骨架;抖音签名反爬常变,如失效需更新签名逻辑。
- 大文件分片上传前端目前走普通直传(≤200MB);如需真正分片,可在 upload 路由加 uploadId/合并。
- 任务存储为进程内 Map,多实例部署请换 Redis/DB。
