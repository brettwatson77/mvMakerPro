import { ai, MODELS } from './genaiClient.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getDb } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

// Resolve correctly to   <repo-root>/backend/output
const OUT_DIR = path.resolve(__dirname, '..', 'output');
const VIDEO_DIR = path.join(OUT_DIR, 'videos');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

export async function submitShots({ shots, model = 'preview', aspectRatio = '16:9', negativePrompt }) {
  const modelName = model === 'fast' ? MODELS.veoFastPreview : MODELS.veoPreview;
  const db = getDb();
  const insJob = db.prepare(`INSERT INTO jobs(id, shot_id, op_name, status, created_at) VALUES(?, ?, ?, ?, ?)`);

  const submitted = [];
  for (const shot of shots) {
    /* ------------------------------------------------------------------
       Submit generation request for a single shot with detailed logging
    ------------------------------------------------------------------ */
    console.log(`[veo] submitting shot ${shot.id} – "${shot.title}"`);
    let op;
    try {
      op = await ai.models.generateVideos({
        model: modelName,
        prompt: shot.prompt,
        // Disable audio generation for faster, cheaper output
        config: {
          aspectRatio,
          enableAudio: false,
          ...(negativePrompt ? { negativePrompt } : {})
        }
      });
      console.log(`[veo] 📤 submit ok → operation=${op.name}`);
    } catch (err) {
      console.error('[veo] ❌ submit failed', {
        shotId: shot.id,
        title: shot.title,
        error: err?.message || err
      });
      /* -----------------------------------------------------------
         Re-throw the error so the caller (queue processor) knows
         the submission failed. This allows the queue to keep the
         shot and retry on the next cycle instead of incorrectly
         marking it as successful.
      ----------------------------------------------------------- */
      throw err;
    }

    // record job in DB only after successful submission
    const id = uuidv4();
    insJob.run(id, shot.id, op.name, 'PENDING', Date.now());
    submitted.push({ id, title: shot.title });
  }
  return { submitted };
}

export async function pollAndDownload(id) {
  const db = getDb();
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  if (!job) throw new Error('job not found');

  let operation = { name: job.op_name, done: false };
  while (!operation.done) {
    operation = await ai.operations.getVideosOperation({ operation });
    if (!operation.done) await new Promise(r => setTimeout(r, 2000));
  }

  /* ------------------------------------------------------------
     Download the video with axios stream to avoid SDK issues
  ------------------------------------------------------------ */
  const videoObj = operation.response.generatedVideos?.[0];
  if (!videoObj) throw new Error('missing video object from Veo response');

  // Correct property path where Veo provides the public download URL
  const videoUri = videoObj.video?.uri;
  if (!videoUri) throw new Error('missing video URI in Veo response');
  const file = path.join(VIDEO_DIR, `${id}.mp4`);

  const writer = fs.createWriteStream(file);
  const response = await axios.get(videoUri, {
    responseType: 'stream',
    /* Google file endpoints require the same auth as the submit call */
    headers: {
      // For file downloads the API key must be supplied via x-goog-api-key
      'x-goog-api-key': process.env.GEMINI_API_KEY
    }
  });

  // Pipe and await completion
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  db.prepare(`UPDATE jobs SET status = 'DONE', file_path = ? WHERE id = ?`).run(`/videos/${id}.mp4`, id);
  return { id, file: `/videos/${id}.mp4` };
}

/**
 * Delete a job row by id.
 * Returns the number of rows removed (0 | 1).
 */
export function deleteJob(id) {
  const db = getDb();
  const info = db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  return info.changes; // 1 if deleted, 0 if nothing matched
}

export function getJobs() {
  const db = getDb();
  return db.prepare(`SELECT j.id, j.status, j.file_path AS file, s.title
                     FROM jobs j LEFT JOIN shots s ON s.id = j.shot_id
                     ORDER BY j.created_at DESC`).all();
}

/**
 * Fetch jobs that are still waiting on the Veo API.
 * These are the jobs our background poller should process.
 */
export function getPendingJobs() {
  const db = getDb();
  return db.prepare(`SELECT j.id, j.op_name
                     FROM jobs j
                     WHERE j.status = 'PENDING'`).all();
}

/**
 * Synchronise any remotely-generated Veo videos that are still available
 * in the Google files endpoint but are missing locally.
 *
 * 1.   Lists all files via REST `files` endpoint
 * 2.   Filters for video mime-types
 * 3.   Compares with local DB `jobs` table (file_path column)
 * 4.   Downloads any missing videos, stores to VIDEO_DIR, inserts a new
 *      job row with status = 'SYNCED'
 * 5.   Returns a summary
 */
export async function syncMissedVideos() {
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  /* 1. List ALL files (pagination) */
  let nextToken = null;
  const remoteVideos = [];
  do {
    const url =
      `${base}/files?pageSize=100` +
      (nextToken ? `&pageToken=${encodeURIComponent(nextToken)}` : '');
    const { data } = await axios.get(url, {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (data.files) {
      data.files
        .filter((f) => /^video\//.test(f.mimeType))
        .forEach((v) => remoteVideos.push(v));
    }
    nextToken = data.nextPageToken;
  } while (nextToken);

  /* 2. Prepare local sync folder
   * ----------------------------------------------------------------
   * Each sync run gets its own timestamped directory to avoid any
   * filename-collision or overwrite issues.
   * e.g.  output/videos/sync_2025-08-16_203000
   * ---------------------------------------------------------------- */
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')               // YYYYMMDDTHHMMSS
    .replace('T', '_');
  const SYNC_DIR = path.join(VIDEO_DIR, `sync_${stamp}`);
  fs.mkdirSync(SYNC_DIR, { recursive: true });

  /* 3. Determine which remote videos we already downloaded during
         **this specific sync run** (folder is empty on first run)    */
  const existing = fs.readdirSync(SYNC_DIR);

  const missing = remoteVideos.filter((v) => {
    const fileId = v.name.split('/')[1]; // files/<id>
    return !existing.includes(`${fileId}.mp4`) && !existing.includes(`${fileId}.bin`);
  });

  let synced = 0;
  const errors = [];

  /* 4. Download each missing video */
  for (const v of missing) {
    const fileId = v.name.split('/')[1];
    const ext = v.mimeType === 'video/mp4' ? '.mp4' : '.bin';
    const localPath = path.join(SYNC_DIR, `${fileId}${ext}`);
    const publicUri = `${base}/${v.name}:download?alt=media&key=${apiKey}`;

    try {
      const response = await axios.get(publicUri, { responseType: 'stream' });
      await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(localPath);
        response.data.pipe(w);
        w.on('finish', resolve);
        w.on('error', reject);
      });
      synced++;
      console.log(`[sync] ✔ downloaded ${fileId}${ext}`);
    } catch (err) {
      console.error(`[sync] ✖ failed ${fileId}:`, err.message || err);
      errors.push({ id: fileId, error: err.message || String(err) });
    }
  }

  return {
    remoteCount: remoteVideos.length,
    alreadyHave: existing.length,
    synced,
    errors
  };
}
