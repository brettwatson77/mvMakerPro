import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../output/veo.sqlite');
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
