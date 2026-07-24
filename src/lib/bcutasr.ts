/**
 * 必剪(B站)免费语音识别 —— 移植自 AsrTools 的 BcutASR。
 * 免费、无需 key、返回带毫秒时间戳的逐句转写。
 * 流程:申请上传 → 分片 PUT → 提交 → 建任务 → 轮询结果。
 */
import fs from 'node:fs';

const API = 'https://member.bilibili.com/x/bcut/rubick-interface';
const HEADERS = {
  'User-Agent': 'Bilibili/1.0.0 (https://www.bilibili.com)',
  'Content-Type': 'application/json',
};

export type Cue = { start: number; end: number; text: string }; // 秒

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0');
}
function srtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** 必剪转写:返回 { text(SRT), timed, cues }。失败抛异常。 */
export async function bcutTranscribe(
  audioPath: string,
): Promise<{ text: string; timed: boolean; cues: Cue[] }> {
  const data = fs.readFileSync(audioPath);

  // 1) 申请上传
  const create = await postJSON(`${API}/resource/create`, {
    type: 2,
    name: 'audio.mp3',
    size: data.length,
    ResourceFileType: 'mp3',
    model_id: '8',
  });
  if (create.code !== 0) throw new Error(`必剪申请上传失败: ${create.message || create.code}`);
  const d = create.data;
  const perSize: number = d.per_size;
  const urls: string[] = d.upload_urls || [];

  // 2) 分片上传(PUT),收集 ETag
  const etags: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const part = data.subarray(i * perSize, (i + 1) * perSize);
    const r = await fetch(urls[i], { method: 'PUT', body: part });
    if (!r.ok) throw new Error(`必剪分片上传失败 HTTP ${r.status}`);
    const etag = (r.headers.get('etag') || r.headers.get('Etag') || '').replace(/"/g, '');
    etags.push(etag);
  }

  // 3) 提交
  const commit = await postJSON(`${API}/resource/create/complete`, {
    InBossKey: d.in_boss_key,
    ResourceId: d.resource_id,
    Etags: etags.join(','),
    UploadId: d.upload_id,
    model_id: '8',
  });
  if (commit.code !== 0) throw new Error(`必剪提交失败: ${commit.message || commit.code}`);
  const downloadUrl = commit.data.download_url;

  // 4) 建任务
  const task = await postJSON(`${API}/task`, { resource: downloadUrl, model_id: '8' });
  if (task.code !== 0) throw new Error(`必剪建任务失败: ${task.message || task.code}`);
  const taskId = task.data.task_id;

  // 5) 轮询结果(state===4 表示完成)
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await (
      await fetch(`${API}/task/result?model_id=7&task_id=${encodeURIComponent(taskId)}`, {
        headers: HEADERS,
      })
    ).json();
    const state = res.data?.state;
    if (state === 4) {
      const parsed = JSON.parse(res.data.result);
      const utts: any[] = parsed.utterances || [];
      const cues: Cue[] = utts.map((u) => ({
        start: (u.start_time || 0) / 1000,
        end: (u.end_time || 0) / 1000,
        text: String(u.transcript || '').trim(),
      }));
      const srt = cues
        .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`)
        .join('\n\n');
      return { text: srt, timed: cues.length > 0, cues };
    }
    if (state === 3 || state === -1) throw new Error('必剪转写失败(任务出错)');
  }
  throw new Error('必剪转写超时');
}

async function postJSON(url: string, body: any) {
  const r = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  return r.json();
}
