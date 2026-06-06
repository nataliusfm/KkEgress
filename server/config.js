import dotenv from 'dotenv';

dotenv.config();

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),

  jwtSecret: process.env.JWT_SECRET || 'insecure-dev-secret-change-me',
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  bootstrapSuperAdmin: (process.env.BOOTSTRAP_SUPER_ADMIN || '').trim().toLowerCase(),
  allowDevLogin: bool(process.env.ALLOW_DEV_LOGIN, false),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '',
    sheets: {
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
      tab: process.env.GOOGLE_SHEETS_TAB || 'Drill Records',
    },
    drive: {
      rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
    },
    photos: {
      refreshToken: process.env.GOOGLE_PHOTOS_REFRESH_TOKEN || '',
      albumTitle: process.env.GOOGLE_PHOTOS_ALBUM_TITLE || 'Emergency Drill Records',
    },
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.NOTIFY_FROM || 'School Emergency Drills <no-reply@localhost>',
  },
};

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COORDINATOR: 'COORDINATOR',
  TEACHER: 'TEACHER',
};

/** Returns true if the email belongs to an allowed school domain. */
export function isAllowedEmail(email) {
  if (!email) return false;
  if (config.allowedEmailDomains.length === 0) return true; // unrestricted in dev
  const domain = email.split('@')[1]?.toLowerCase();
  return config.allowedEmailDomains.includes(domain);
}
