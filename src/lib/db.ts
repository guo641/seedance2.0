import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// 打包后(Electron)用可写的 DATA_DIR;开发时默认项目 data 目录
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const g = globalThis as unknown as { __db?: Database.Database };

export const db =
  g.__db ??
  (() => {
    // BYOK 版新库(owner_id 为 key 哈希字符串,无账号体系)
    const d = new Database(path.join(DATA_DIR, 'app-byok.db'));
    d.pragma('journal_mode = WAL');
    init(d);
    g.__db = d;
    return d;
  })();

function init(d: Database.Database) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   TEXT NOT NULL,             -- key 哈希
    kind       TEXT NOT NULL DEFAULT 'analysis',
    name       TEXT NOT NULL,
    icon       TEXT,
    pinned     INTEGER NOT NULL DEFAULT 0,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    TEXT NOT NULL,
    folder_id   INTEGER,
    mode        TEXT NOT NULL,
    model       TEXT,
    source_url  TEXT,
    video_url   TEXT,
    subtitle_url TEXT,
    segment_seconds INTEGER NOT NULL DEFAULT 12,
    storyboard  TEXT NOT NULL,
    title       TEXT,
    tags        TEXT,
    summary     TEXT,
    favorite    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    TEXT NOT NULL,
    folder_id   INTEGER,
    variant_of  INTEGER,
    name        TEXT,
    content     TEXT NOT NULL,
    meta        TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses(owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prompts_owner  ON prompts(owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_folders_owner  ON folders(owner_id);
  `);
}
