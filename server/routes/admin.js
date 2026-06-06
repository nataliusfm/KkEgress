import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config.js';
import { db } from '../store.js';
import { requireAuth, requireRole, audit } from '../middleware.js';
import { publicUser } from './auth.js';
import { googleStatus } from '../services/google.js';

const router = Router();
router.use(requireAuth);

const ADMIN = requireRole(ROLES.SUPER_ADMIN);

// ─────────────── School settings ───────────────
router.get('/school', (req, res) => res.json(db.getSchool()));
router.put('/school', ADMIN, (req, res) => {
  const { name, address, location, logoUrl } = req.body;
  const updated = db.updateSchool({
    ...(name !== undefined && { name }),
    ...(address !== undefined && { address }),
    ...(location !== undefined && { location }),
    ...(logoUrl !== undefined && { logoUrl }),
  });
  audit(req, 'UPDATE_SCHOOL', { name: updated.name });
  res.json(updated);
});

router.get('/google-status', (req, res) => res.json(googleStatus()));

// ─────────────── Users ───────────────
router.get('/users', requireRole(ROLES.SUPER_ADMIN, ROLES.COORDINATOR), (req, res) => {
  res.json(db.users().map(publicUser));
});

router.post('/users', ADMIN, async (req, res) => {
  const { email, name, role, employeeId, teamName, assemblyPointId, assignedStudents, password } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email and name required.' });
  if (db.findUserByEmail(email)) return res.status(409).json({ error: 'User already exists.' });
  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const passwordHash = password ? await bcrypt.hash(password, 10) : '';
  const user = db.addUser({
    email: email.toLowerCase(),
    name,
    role,
    employeeId: employeeId || '',
    teamName: teamName || '',
    assemblyPointId: assemblyPointId || '',
    assignedStudents: Number(assignedStudents) || 0,
    passwordHash,
  });
  audit(req, 'CREATE_USER', { email: user.email, role: user.role });
  res.status(201).json(publicUser(user));
});

router.put('/users/:id', ADMIN, (req, res) => {
  const allowed = ['name', 'role', 'employeeId', 'teamName', 'assemblyPointId', 'assignedStudents'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (patch.role && !Object.values(ROLES).includes(patch.role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (patch.assignedStudents !== undefined) patch.assignedStudents = Number(patch.assignedStudents) || 0;
  const user = db.updateUser(req.params.id, patch);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  audit(req, 'UPDATE_USER', { id: user.id, patch });
  res.json(publicUser(user));
});

/** Admin sets or resets a user's password. */
router.post('/users/:id/set-password', ADMIN, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.updateUser(req.params.id, { passwordHash });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  audit(req, 'SET_PASSWORD', { id: user.id });
  res.json({ ok: true });
});

router.delete('/users/:id', ADMIN, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself.' });
  db.deleteUser(req.params.id);
  audit(req, 'DELETE_USER', { id: req.params.id });
  res.json({ ok: true });
});

// ─────────────── Assembly points ───────────────
router.get('/assembly-points', (req, res) => res.json(db.assemblyPoints()));
router.post('/assembly-points', ADMIN, (req, res) => {
  const { name, location, capacity } = req.body;
  if (!name || !location) return res.status(400).json({ error: 'Name and location required.' });
  const ap = db.addAssemblyPoint({ name, location, capacity: Number(capacity) || 0 });
  audit(req, 'CREATE_ASSEMBLY_POINT', { name });
  res.status(201).json(ap);
});
router.put('/assembly-points/:id', ADMIN, (req, res) => {
  const ap = db.updateAssemblyPoint(req.params.id, req.body);
  if (!ap) return res.status(404).json({ error: 'Not found.' });
  res.json(ap);
});
router.delete('/assembly-points/:id', ADMIN, (req, res) => {
  db.deleteAssemblyPoint(req.params.id);
  res.json({ ok: true });
});

// ─────────────── Drill types ───────────────
router.get('/drill-types', (req, res) => res.json(db.drillTypes()));
router.post('/drill-types', ADMIN, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required.' });
  const dt = db.addDrillType({ name });
  audit(req, 'CREATE_DRILL_TYPE', { name });
  res.status(201).json(dt);
});
router.delete('/drill-types/:id', ADMIN, (req, res) => {
  db.deleteDrillType(req.params.id);
  res.json({ ok: true });
});

// ─────────────── Audit trail ───────────────
router.get('/audit', requireRole(ROLES.SUPER_ADMIN, ROLES.COORDINATOR), (req, res) => {
  res.json(db.audit().slice(0, 500));
});

export default router;
