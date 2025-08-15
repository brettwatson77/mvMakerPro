import { Router } from 'express';
import { planScenes, getPlan, enhanceScene } from '../services/planner.js';
import { z } from 'zod';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const schema = z.object({
      description: z.string().min(10),
      songLengthSec: z.number().int().positive(),
      aspectRatio: z.string().default('16:9')
    });
    const body = schema.parse(req.body);
    const plan = await planScenes({
      description: body.description,
      songLengthSec: body.songLengthSec,
      targetAspect: body.aspectRatio
    });
    res.json(plan);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:planId', (req, res) => {
  try {
    const data = getPlan(req.params.planId);
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: 'not found' });
  }
});

router.post('/enhance', async (req, res) => {
  try {
    const schema = z.object({
      sceneId: z.string(),
      concept: z.string().min(3),
      shots: z.array(z.object({ id: z.string(), title: z.string(), action: z.string() }))
    });
    const body = schema.parse(req.body);
    const enhanced = await enhanceScene(body);
    res.json(enhanced);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
