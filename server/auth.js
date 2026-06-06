import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config, ROLES, isAllowedEmail } from './config.js';
import { db } from './store.js';

const oauthClient = config.google.clientId
  ? new OAuth2Client(config.google.clientId)
  : null;

/** Sign a session JWT for a user record. */
export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Resolve (or create) the local user for a verified Google identity.
 * Enforces the school-email-domain restriction and bootstraps the first
 * super administrator from configuration.
 */
export function resolveUser({ email, name, picture }) {
  email = String(email).toLowerCase();
  if (!isAllowedEmail(email)) {
    const err = new Error('Email domain is not permitted to sign in.');
    err.status = 403;
    throw err;
  }

  let user = db.findUserByEmail(email);
  if (!user) {
    const isBootstrapAdmin =
      config.bootstrapSuperAdmin && email === config.bootstrapSuperAdmin;
    user = db.addUser({
      email,
      name: name || email.split('@')[0],
      picture: picture || '',
      role: isBootstrapAdmin ? ROLES.SUPER_ADMIN : ROLES.TEACHER,
      employeeId: '',
      teamName: '',
      assemblyPointId: '',
    });
  } else if (name && !user.name) {
    db.updateUser(user.id, { name });
  }
  return user;
}

/** Verify a Google ID token (from Google Identity Services on the frontend). */
export async function verifyGoogleIdToken(idToken) {
  if (!oauthClient) {
    const err = new Error('Google Sign-In is not configured (GOOGLE_CLIENT_ID).');
    err.status = 500;
    throw err;
  }
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.email_verified) {
    const err = new Error('Google account email is not verified.');
    err.status = 403;
    throw err;
  }
  return { email: payload.email, name: payload.name, picture: payload.picture };
}
