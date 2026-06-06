import { Router } from 'express';
import { ROLES } from '../config.js';
import { db } from '../store.js';
import { requireAuth, requireRole, audit } from '../middleware.js';
import { computeStats } from '../services/stats.js';
import { notify, NOTIFY_ROLES } from '../services/notifications.js';
import { emitToAll } from '../realtime.js';

const router = Router();
router.use(requireAuth);

const MANAGE = requireRole(ROLES.SUPER_ADMIN);

/** List drills (most recent first). */
router.get('/', (req, res) => {
  const drills = [...db.drills()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(drills);
});

/** The currently active drill, if any. */
router.get('/active', (req, res) => {
  res.json(db.activeDrill());
});

/** Create a drill event (Planned). */
router.post('/', MANAGE, (req, res) => {
  const { name, type, date, startTime, coordinatorId, notes } = req.body;
  if (!name || !type || !date) {
    return res.status(400).json({ error: 'Name, type and date are required.' });
  }
  const drillType = db.drillTypes().find((t) => t.id === type);
  const coordinator = coordinatorId ? db.findUserById(coordinatorId) : null;
  const drill = db.addDrill({
    name,
    type,
    typeName: drillType?.name || type,
    date,
    startTime: startTime || '',
    coordinatorId: coordinatorId || '',
    coordinatorName: coordinator?.name || '',
    notes: notes || '',
    createdBy: req.user.id,
    status: 'Planned',
  });
  audit(req, 'CREATE_DRILL', { id: drill.id, name });
  emitToAll('drill:update', drill);
  res.status(201).json(drill);
});

/** Update drill metadata. */
router.put('/:id', MANAGE, (req, res) => {
  const allowed = ['name', 'date', 'startTime', 'coordinatorId', 'notes'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (patch.coordinatorId) {
    patch.coordinatorName = db.findUserById(patch.coordinatorId)?.name || '';
  }
  const drill = db.updateDrill(req.params.id, patch);
  if (!drill) return res.status(404).json({ error: 'Drill not found.' });
  audit(req, 'UPDATE_DRILL', { id: drill.id, patch });
  emitToAll('drill:update', drill);
  res.json(drill);
});

/** Transition drill status: Planned -> Active -> Completed. */
router.post('/:id/status', MANAGE, async (req, res) => {
  const { status } = req.body;
  if (!['Planned', 'Active', 'Completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const drill = db.findDrill(req.params.id);
  if (!drill) return res.status(404).json({ error: 'Drill not found.' });

  if (status === 'Active') {
    // Only one active drill at a time.
    const current = db.activeDrill();
    if (current && current.id !== drill.id) {
      return res.status(409).json({ error: `Another drill ("${current.name}") is already active.` });
    }
    db.updateDrill(drill.id, { status: 'Active', startedAt: new Date().toISOString() });
    await notify('DRILL_STARTED', `Drill "${drill.name}" has started.`, {
      severity: 'info', drillId: drill.id, emailRoles: NOTIFY_ROLES.ALL_STAFF,
    });
  } else if (status === 'Completed') {
    db.updateDrill(drill.id, { status: 'Completed', completedAt: new Date().toISOString() });
    await notify('DRILL_COMPLETED', `Drill "${drill.name}" has been completed.`, {
      severity: 'info', drillId: drill.id, emailRoles: NOTIFY_ROLES.COORDINATORS,
    });
  } else {
    db.updateDrill(drill.id, { status });
  }

  const updated = db.findDrill(drill.id);
  audit(req, 'DRILL_STATUS', { id: drill.id, status });
  emitToAll('drill:update', updated);
  emitToAll('stats:update', computeStats(updated));
  res.json(updated);
});

/** Live statistics for a drill (or the active drill). */
router.get('/:id/stats', (req, res) => {
  const drill = req.params.id === 'active' ? db.activeDrill() : db.findDrill(req.params.id);
  res.json(computeStats(drill));
});

export default router;
