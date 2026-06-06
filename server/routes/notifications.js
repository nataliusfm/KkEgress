import { Router } from 'express';
import { db } from '../store.js';
import { requireAuth } from '../middleware.js';

const router = Router();
router.use(requireAuth);

/** Recent in-app notifications visible to the current user. */
router.get('/', (req, res) => {
  const items = db.notifications().filter((n) => !n.userId || n.userId === req.user.id).slice(0, 100);
  res.json(items);
});

router.post('/:id/read', (req, res) => {
  db.markNotificationRead(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
