import { Router } from 'express';
import { getJobs, deleteJob } from '../services/veo3.js';
import { addShotToQueue } from '../services/queue.js';
import { z } from 'zod';

const router = Router();

router.get('/jobs', (req, res) => res.json({ jobs: getJobs() }));

router.post('/submit', async (req, res) => {
  try {
    const schema = z.object({
      shots: z.array(z.object({ id: z.string(), title: z.string(), prompt: z.string() })),
      model: z.enum(['preview', 'fast']).default('preview'),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
      negativePrompt: z.string().optional()
    });
    const body = schema.parse(req.body);

    /*  Queue each shot for generation (smart queue enforces 2-min gap) */
    const queued = body.shots.map((sh) => addShotToQueue(sh));

    res.json({ success: true, queued });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;

// ---------------------------------------------------------------------------
// DELETE  /jobs/:id           – remove a finished / unwanted job from queue
// ---------------------------------------------------------------------------
router.delete('/jobs/:id', async (req, res) => {
  /* Param validation */
  const paramSchema = z.object({ id: z.string().uuid() });
  try {
    const { id } = paramSchema.parse(req.params);

    const removed = await deleteJob(id);
    if (!removed) {
      return res.status(404).json({ error: 'job not found' });
    }
    res.json({ ok: true, id });
  } catch (e) {
    /* zod validation errors → 400, others → 500 */
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[DELETE /jobs/:id] error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});
