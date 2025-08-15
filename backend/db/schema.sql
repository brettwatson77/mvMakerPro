PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  song_length_sec INTEGER NOT NULL,
  aspect_ratio TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_sec INTEGER,
  end_sec INTEGER,
  concept TEXT
  ,context TEXT
);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  duration_sec INTEGER DEFAULT 8,
  prompt TEXT,
  style_json TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE SET NULL,
  op_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  file_path TEXT,
  created_at INTEGER NOT NULL
);
