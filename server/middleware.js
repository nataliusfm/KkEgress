import { verifySession } from './auth.js';
import { db } from './store.js';

/** Extract a bearer token from the Authorization header. */
function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Require a valid session; attaches req.user (the live DB record). */
export function requireAuth(req, res, next) {
  const token = bearer(req);
  const claims = token && verifySession(token);
  if (!claims) return res.status(401).json({ error: 'Authentication required.' });
  const user = db.findUserById(claims.sub);
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });
  req.user = user;
  next();
}

/** Require the user to hold one of the given roles. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

/** Records an audit-trail entry. */
export function audit(req, action, details = {}) {
  db.addAudit({
    userId: req.user?.id || null,
    userEmail: req.user?.email || 'anonymous',
    action,
    details,
    ip: req.ip,
  });
}
