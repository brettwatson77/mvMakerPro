import { ai, openai, MODELS } from './genaiClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db.js';

function getText(resp) {
  // Supports SDKs that return resp.text() or resp.text
  if (!resp) return '';
  if (typeof resp.text === 'function') return resp.text();
  if (typeof resp.text === 'string') return resp.text;
  // Fallbacks for other shapes (Vertex/Gemini candidates)
  const cand = resp.response?.candidates?.[0];
  if (cand?.content?.parts?.length) {
    return cand.content.parts.map(p => p.text || '').join('');
  }
  return '';
}

/**
 * Normalise model output to plain JSON.
 * The Gemini / Veo models sometimes wrap JSON in markdown fences:
 * ```json\n{ ... }\n```
 * Strip those fences if present.
 */
function stripMarkdownCodeFence(text) {
  if (!text) return text;
  const fenceStart = text.indexOf('```json');
  if (fenceStart === -1) return text.trim();
  // start of JSON content is after the first newline following ```json
  const afterStart = text.indexOf('\n', fenceStart);
  if (afterStart === -1) return text.trim();
  const fenceEnd = text.indexOf('```', afterStart);
  if (fenceEnd === -1) return text.trim();
  return text.slice(afterStart + 1, fenceEnd).trim();
}

export async function planScenes({ description, songLengthSec, targetAspect = '16:9' }) {
  /* -------- usability factor & shot count helpers -------- */
  const USABILITY_FACTOR = 2.0;        // 200 % footage rule
  const AVG_SHOT_LEN_SEC = 8;          // default length we already assume

  const minutes = Math.max(0.5, songLengthSec / 60).toFixed(2);
  const targetDurationSec = songLengthSec * USABILITY_FACTOR;
  const numShots = Math.round(targetDurationSec / AVG_SHOT_LEN_SEC);
  /*  ──────────────────────────────────────────────────────────
      SYSTEM PROMPT – must force the model to emit ONLY JSON.
      Any stray prose / markdown causes a 400 in the frontend.
     ────────────────────────────────────────────────────────── */
  const sys = [
    'You are an award-winning music-video director and editor.',
    `Create a complete shot-list that will fit within a ${minutes}-minute song.`,
    '',
    'OUTPUT RULES (DO NOT BREAK):',
    '• Respond with ONE single JSON object and nothing else – no code fences, no markdown, no commentary.',
    '• The root object must have:  scenes  →  array.',
    '• Each scene object: { id, title, start, end, shots }.',
    '• start / end are seconds (number).',
    '• shots is an array of shot objects.',
    '• Each shot: { id, title, action, durationSec }.',
    '• id fields must be uuid-like strings (or leave blank, client will fill).',
    '• durationSec defaults to 8 if you omit it.',
    `• Aim for roughly ${numShots} shots in total.`,
    '',
    'ABSOLUTELY NO OTHER FIELDS.  ABSOLUTELY NO TEXT OUTSIDE THE JSON.',
  ].join(' ');

  const response = await openai.chat.completions.create({
    model: MODELS.gpt4o,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `Video concept: ${description}\nSong length (sec): ${songLengthSec}\nAspect ratio: ${targetAspect}`
      }
    ]
  });

  // extract JSON string
  const rawContent = response.choices?.[0]?.message?.content ?? '';

  // 👇 strip any accidental markdown fences (extra safety)
  const txt = stripMarkdownCodeFence(rawContent);
  if (!txt) throw new Error('Empty planner response');
  let planned;
  try {
    planned = JSON.parse(txt);
  } catch (e) {
    console.error('[planScenes] JSON parse failed. Raw text:', txt);
    throw new Error('Planner returned invalid JSON');
  }

  const db = getDb();
  const planId = uuidv4();
  const now = Date.now();

  const insPlan = db.prepare(`INSERT INTO plans(id, description, song_length_sec, aspect_ratio, created_at)
                              VALUES (?, ?, ?, ?, ?)`);
  const insScene = db.prepare(`INSERT INTO scenes(id, plan_id, title, start_sec, end_sec, concept)
                               VALUES(?, ?, ?, ?, ?, ?)`);
  const insShot = db.prepare(`INSERT INTO shots(id, scene_id, title, action, duration_sec, prompt, style_json)
                              VALUES(?, ?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    insPlan.run(planId, description, songLengthSec, targetAspect, now);
    for (const s of planned.scenes) {
      const sid = s.id || uuidv4();
      insScene.run(sid, planId, s.title, s.start ?? null, s.end ?? null, s.concept ?? '');
      for (const sh of s.shots) {
        const shid = sh.id || uuidv4();
        insShot.run(
          shid,
          sid,
          sh.title,
          sh.action,
          sh.durationSec ?? 8,
          sh.prompt || null,
          sh.style ? JSON.stringify(sh.style) : null
        );
      }
    }
  });
  tx();

  return getPlan(planId);
}

export function getPlan(planId) {
  const db = getDb();
  const plan = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(planId);
  const scenes = db.prepare(`SELECT * FROM scenes WHERE plan_id = ? ORDER BY start_sec`).all(planId);
  const shotsStmt = db.prepare(`SELECT * FROM shots WHERE scene_id = ? ORDER BY rowid`);
  for (const s of scenes) s.shots = shotsStmt.all(s.id);
  return { id: plan.id, description: plan.description, songLengthSec: plan.song_length_sec, aspectRatio: plan.aspect_ratio, scenes };
}

export async function enhanceScene({ sceneId, concept, shots, dial = 'cinematic' }) {
  const sys = `You are a cinematographer. Enhance the shot ACTIONS with lens, camera, depth, film stock, lighting. Output JSON.`;
  const response = await ai.models.generateContent({
    model: MODELS.textPlanner,
    systemInstruction: { role: 'system', parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ concept, shots, dial }) }] }],
    generationConfig: { responseMimeType: 'application/json' }
  });

  // 👇 robustly handle SDK differences and strip markdown fences
  const txt = stripMarkdownCodeFence(getText(response));
  if (!txt) throw new Error('Empty enhance response');
  let out;
  try {
    out = JSON.parse(txt);
  } catch (e) {
    console.error('[enhanceScene] JSON parse failed. Raw text:', txt);
    throw new Error('Enhancer returned invalid JSON');
  }

  const db = getDb();
  const upScene = db.prepare(`UPDATE scenes SET concept = ? WHERE id = ?`);
  const upShot = db.prepare(`UPDATE shots SET action = ?, style_json = ?, prompt = COALESCE(?, prompt) WHERE id = ?`);

  const tx = db.transaction(() => {
    upScene.run(concept, sceneId);
    for (let i = 0; i < out.shots.length; i++) {
      const s = out.shots[i];
      const original = shots[i]; // same ordering from UI
      upShot.run(s.action, s.style ? JSON.stringify(s.style) : null, s.prompt || null, original.id);
    }
  });
  tx();

  const scene = db.prepare(`SELECT * FROM scenes WHERE id = ?`).get(sceneId);
  const newShots = db.prepare(`SELECT * FROM shots WHERE scene_id = ?`).all(sceneId);
  scene.shots = newShots;
  return scene;
}
