import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------------------ 
 * Ensure the database is always created in:
 *   <repo-root>/backend/output/veo.sqlite
 * Using explicit path segments avoids accidental nesting such as
 * “backend/backend/output/…”.
 * ------------------------------------------------------------------ */
const dbPath =
  process.env.DB_PATH ||
  path.resolve(__dirname, '..', 'output', 'veo.sqlite');

const schemaPath = path.resolve(__dirname, './schema.sql');

export function getDb() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function runMigrations(db) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);

  /* ------------------------------------------------------------------
   * 2024-07  Hot-fix migration
   * ---------------------------------
   * Older versions of the schema defined `jobs.shot_id` as NOT NULL.
   * The new “sync missed videos” feature legitimately inserts rows
   * that have no originating shot, so `shot_id` must be nullable.
   *
   * SQLite can’t simply DROP a NOT NULL constraint, so we:
   *   1. Detect the legacy schema (shot_id NOT NULL)
   *   2. If present, create a new table with the correct definition
   *   3. Copy data, drop the old table, then rename.
   *      (all inside a single transaction for safety)
   * ------------------------------------------------------------------ */
  const info = db
    .prepare("PRAGMA table_info(jobs)")
    .all()
    .reduce((acc, row) => ({ ...acc, [row.name]: row }), {});

  if (info.shot_id?.notnull === 1) {
    console.warn(
      '[db] Detected legacy NOT NULL constraint on jobs.shot_id – applying migration'
    );

    db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS jobs_new (
        id         TEXT PRIMARY KEY NOT NULL,
        shot_id    TEXT,                 -- now nullable ✅
        op_name    TEXT,
        status     TEXT,
        created_at INTEGER,
        file_path  TEXT
      );
      INSERT INTO jobs_new(id, shot_id, op_name, status, created_at, file_path)
      SELECT id, shot_id, op_name, status, created_at, file_path FROM jobs;
      DROP TABLE jobs;
      ALTER TABLE jobs_new RENAME TO jobs;
      COMMIT;
    `);

    console.log('[db] Migration complete – jobs.shot_id is now nullable');
  }
}

// allow `node db.js --init`
if (process.argv.includes('--init')) {
  const db = getDb();
  runMigrations(db);
  console.log(`[db] initialized at ${dbPath}`);
}

/** 👉 add this: exported, idempotent schema init for server boot */
export function ensureSchema() {
  const db = getDb();
  runMigrations(db);
  return db;
}
