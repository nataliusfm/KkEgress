import nodemailer from 'nodemailer';
import { config, ROLES } from '../config.js';
import { db } from '../store.js';

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter;
  if (!config.smtp.host || !config.smtp.user) {
    transporter = false; // explicitly "not configured"
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

let io = null;
export function bindRealtime(socketServer) {
  io = socketServer;
}

async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] not configured — would send "${subject}" to ${to}`);
    return false;
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return false;
  }
}

/**
 * Emit an in-app notification (persisted + pushed over websocket) and email
 * the relevant recipients.
 *
 * @param {string} type   e.g. 'DRILL_STARTED', 'REPORT_SUBMITTED'
 * @param {string} message human-readable text
 * @param {object} opts   { severity, drillId, emailRoles: [ROLES], data }
 */
export async function notify(type, message, opts = {}) {
  const { severity = 'info', drillId = null, emailRoles = [], data = {} } = opts;

  const record = db.addNotification({ type, message, severity, drillId, data });
  if (io) io.emit('notification', record);

  if (emailRoles.length) {
    const recipients = db
      .users()
      .filter((u) => emailRoles.includes(u.role))
      .map((u) => u.email);
    if (recipients.length) {
      await sendEmail(recipients.join(','), `[Drill] ${message}`, message);
    }
  }
  return record;
}

export const NOTIFY_ROLES = {
  COORDINATORS: [ROLES.SUPER_ADMIN, ROLES.COORDINATOR],
  ALL_STAFF: [ROLES.SUPER_ADMIN, ROLES.COORDINATOR, ROLES.TEACHER],
};
