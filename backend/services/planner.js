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
          (sh.prompt || sh.action || null), // ensure a default prompt exists
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

/**
 * Enhanced scene generation with full context awareness.
 * Takes the overall video concept, scene concept, and shot list to create
 * context-rich prompts for each shot that maintain consistency.
 * 
 * @param {Object} params - The parameters object
 * @param {string} params.overallConcept - The overall video concept
 * @param {string} params.sceneId - The ID of the scene being enhanced
 * @param {string} params.concept - The scene concept
 * @param {Array} params.shots - The list of shots in the scene
 * @param {string} params.dial - The cinematic style dial setting (default: 'cinematic')
 * @returns {Object} - The enhanced scene with context-rich shot prompts
 */
export async function enhanceWithContext({ overallConcept, sceneId, concept, shots, dial = 'cinematic' }) {
  /* ──────────────────────────────────────────────────────────
     Use GPT-4o for context-aware prompts with rich cinematography
  ────────────────────────────────────────────────────────── */
  const sys = [
    // -----------------------------------------------------------------------
    // ACT AS DIRECTOR OF PHOTOGRAPHY WITH FULL CONTEXT AWARENESS
    // -----------------------------------------------------------------------
    'You are an award-winning Director of Photography and cinematic storyteller.',
    'Your task is to create CONTEXT-RICH, CONSISTENT prompts for each shot in a music video scene.',
    'These prompts will be sent to Google Veo-3 AI video generation model.',
    '',
    'STEP 1 → Create a "masterStyle" paragraph that defines the CONSISTENT visual language for ALL shots:',
    '        • Camera style (handheld, steadicam, locked-off)',
    '        • Lens characteristics (wide, telephoto, anamorphic)',
    '        • Lighting approach (high-key, low-key, practical sources)',
    '        • Color palette and grade (warm, cool, desaturated)',
    '        • Visual references (e.g., "Wes Anderson symmetry" or "Fincher noir")',
    '',
    'STEP 2 → For EACH shot, create a context-rich prompt that COMBINES:',
    '        1. A brief summary of the overall video concept (1-2 sentences)',
    '        2. A summary of this specific scene\'s role in the story (1 sentence)',
    '        3. The specific action happening in this shot (detailed)',
    '        4. Technical cinematography details from the masterStyle',
    '',
    'CRITICAL: Each shot prompt MUST maintain character consistency, location continuity,',
    'and visual style across the entire scene. Every prompt should feel like part of the',
    'same cohesive world and narrative.',
    '',
    'STRICT OUTPUT FORMAT (NO markdown, NO commentary, NO extra keys):',
    '{',
    '  "masterStyle": "<paragraph describing consistent visual approach>",',
    '  "shots": [',
    '     { "id": "<original shot id>", "action": "<detailed action>", "prompt": "<context-rich prompt>" },',
    '     { "id": "...", "action": "...", "prompt": "..." }',
    '  ]',
    '}'
  ].join(' ');

  const response = await openai.chat.completions.create({
    model: MODELS.gpt4o,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: JSON.stringify({ 
          overallConcept,
          concept, 
          shots,
          dial
        })
      }
    ]
  });

  // Extract the JSON string safely
  const rawContent = response.choices?.[0]?.message?.content ?? '';
  const txt = stripMarkdownCodeFence(rawContent);
  if (!txt) throw new Error('Empty enhance response');
  let out;
  try {
    out = JSON.parse(txt);
  } catch (e) {
    console.error('[enhanceWithContext] JSON parse failed. Raw text:', txt);
    throw new Error('Enhancer returned invalid JSON');
  }

  const db = getDb();
  const upScene = db.prepare(`UPDATE scenes SET concept = ?, context = ? WHERE id = ?`);
  const upShot = db.prepare(`UPDATE shots SET action = ?, prompt = ? WHERE id = ?`);

  const masterStyle = (out.masterStyle || '').trim();

  const tx = db.transaction(() => {
    upScene.run(concept, masterStyle, sceneId);
    for (const shot of out.shots) {
      upShot.run(
        shot.action,
        shot.prompt,
        shot.id
      );
    }
  });
  tx();

  const scene = db.prepare(`SELECT * FROM scenes WHERE id = ?`).get(sceneId);
  const newShots = db.prepare(`SELECT * FROM shots WHERE scene_id = ?`).all(sceneId);
  scene.shots = newShots;
  return scene;
}

/**
 * Legacy enhance function - now a wrapper around enhanceWithContext
 * Maintains backward compatibility with existing frontend
 */
export async function enhanceScene({ sceneId, concept, shots, dial = 'cinematic' }) {
  // Get the overall concept from the database using the sceneId
  const db = getDb();
  const scene = db.prepare(`SELECT s.id, p.description AS overallConcept 
                           FROM scenes s 
                           JOIN plans p ON s.plan_id = p.id 
                           WHERE s.id = ?`).get(sceneId);
  
  if (!scene) {
    throw new Error(`Scene with ID ${sceneId} not found`);
  }

  // Call the new enhanceWithContext function with the overall concept
  return enhanceWithContext({
    overallConcept: scene.overallConcept,
    sceneId,
    concept,
    shots,
    dial
  });
}
