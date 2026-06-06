import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db } from '../store.js';
import {
  verifyGoogleIdToken,
  resolveUser,
  signSession,
} from '../auth.js';
import { requireAuth, audit } from '../middleware.js';

const router = Router();

/** Public client config the frontend needs to bootstrap. */
router.get('/config', (req, res) => {
  res.json({
    googleClientId: config.google.clientId,
    mapsApiKey: config.google.mapsApiKey,
    allowDevLogin: config.allowDevLogin,
    allowedEmailDomains: config.allowedEmailDomains,
    schoolName: db.getSchool().name,
    logoUrl: db.getSchool().logoUrl || '',
  });
});

/** Email + password login. */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = db.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    audit({ user }, 'LOGIN', { method: 'password' });
    res.json({ token: signSession(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Exchange a Google ID token for an app session. */
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
    const profile = await verifyGoogleIdToken(credential);
    const user = resolveUser(profile);
    audit({ user }, 'LOGIN', { method: 'google' });
    res.json({ token: signSession(user), user: publicUser(user) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
});

/** Dev-only password-less login (guarded by ALLOW_DEV_LOGIN). */
router.post('/dev', (req, res) => {
  if (!config.allowDevLogin) return res.status(403).json({ error: 'Dev login disabled.' });
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required.' });
    const user = resolveUser({ email, name });
    audit({ user }, 'LOGIN', { method: 'dev' });
    res.json({ token: signSession(user), user: publicUser(user) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/** Return the currently authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    picture: u.picture || '',
    employeeId: u.employeeId || '',
    teamName: u.teamName || '',
    assemblyPointId: u.assemblyPointId || '',
    assignedStudents: u.assignedStudents || 0,
    hasPassword: !!u.passwordHash,
  };
}

export default router;
