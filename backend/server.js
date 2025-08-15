// backend/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import planRouter from './routes/plan.js';
import veoRouter from './routes/veo.js';
import { ensureSchema, getDb } from './db/db.js'; // ← ensure schema & access DB
import { start as startPoller } from './services/poller.js'; // ← background job poller

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[boot] server starting');

const app = express();

/** CORS: allow your local frontend (include localhost + 127.0.0.1 just in case) */
const allowed =
  (process.env.CLIENT_ORIGIN?.split(',').map(s => s.trim()) ||
   ['http://localhost:3010','http://127.0.0.1:3010']);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: ${origin} not allowed`));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.options('*', cors());

app.use(express.json({ limit: '2mb' }));

/** Ensure SQLite schema exists (idempotent) */
try {
  ensureSchema();
  console.log('[db] ready at', process.env.DB_PATH || 'backend/output/veo.sqlite');
} catch (e) {
  console.error('[boot] ensureSchema FAILED:', e);
  // Exit so you see the error clearly rather than a half-booted server
  process.exit(1);
}

/** Static: generated videos */
app.use(
  '/videos',
  express.static(path.resolve(__dirname, 'output', 'videos'))
);

/** API routes */
app.use('/api/plan', planRouter);
app.use('/api/veo', veoRouter);

/** Root health check */
app.get('/', (req, res) => res.json({ ok: true }));

/** Health checks */
app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));
app.get('/api/health/db', (req, res) => {
  try {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    res.json({ ok: true, tables });
  } catch (e) {
    console.error('[db health] error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = Number(process.env.PORT) || 3011;
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
  startPoller(); // kick off background polling for Veo jobs
});
