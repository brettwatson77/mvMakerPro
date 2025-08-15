import { ai, MODELS } from './genaiClient.js';
import fs from 'fs';
import path from 'path';
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
    const op = await ai.models.generateVideos({
      model: modelName,
      prompt: shot.prompt,
      config: { aspectRatio, ...(negativePrompt ? { negativePrompt } : {}) }
    });

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

  const videoObj = operation.response.generatedVideos[0];
  const file = path.join(VIDEO_DIR, `${id}.mp4`);
  // Google GenAI SDK uses `ai.media.download`, not `ai.files.download`
  await ai.media.download({ file: videoObj.video, downloadPath: file });

  db.prepare(`UPDATE jobs SET status = 'DONE', file_path = ? WHERE id = ?`).run(`/videos/${id}.mp4`, id);
  return { id, file: `/videos/${id}.mp4` };
}

export function getJobs() {
  const db = getDb();
  return db.prepare(`SELECT j.id, j.status, j.file_path AS file, s.title
                     FROM jobs j LEFT JOIN shots s ON s.id = j.shot_id
                     ORDER BY j.created_at DESC`).all();
}
