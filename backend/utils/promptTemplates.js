// Utility to compose final Veo prompt strings from structured data
export function buildVeoPrompt({
  logline, // short concept for the scene
  shot,    // { title, action }
  style = {}, // { lens, camera, movement, focus, film, lighting, grade, fps }
  audio = {}, // { dialogue, sfx, ambience }
  negatives = 'cartoon, low quality, text overlays, watermarks'
}) {
  const parts = [];
  parts.push(`${shot.title}: ${shot.action}`);
  if (logline) parts.push(`Scene concept: ${logline}`);
  // Cinematography details
  const cine = [];
  if (style.lens) cine.push(`${style.lens} lens`);
  if (style.camera) cine.push(style.camera);
  if (style.movement) cine.push(style.movement);
  if (style.focus) cine.push(style.focus);
  if (style.film) cine.push(style.film);
  if (style.lighting) cine.push(style.lighting);
  if (style.grade) cine.push(`${style.grade} color grade`);
  if (style.fps) cine.push(`${style.fps} fps`);
  if (cine.length) parts.push(`Cinematography: ${cine.join(', ')}`);
  // Audio cues (Veo 3 supports dialogue & SFX in prompt)
  const audioLines = [];
  if (audio.dialogue?.length) audioLines.push(`Dialogue: ${audio.dialogue.map(q => `"${q}"`).join(' ')}`);
  if (audio.sfx) audioLines.push(`SFX: ${audio.sfx}`);
  if (audio.ambience) audioLines.push(`Ambience: ${audio.ambience}`);
  if (audioLines.length) parts.push(audioLines.join(' | '));
  // Negatives
  if (negatives) parts.push(`Negative: ${negatives}`);
  // Guidance
  parts.push('Present tense, continuous motion, cinematic realism.');
  return parts.join('\n');
}
