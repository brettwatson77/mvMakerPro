import { ai, MODELS } from './genaiClient.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getDb } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

const OUT_DIR = path.resolve('backend/output');
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
      // skip this shot, continue with others
      continue;
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
