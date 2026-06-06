import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

/**
 * Real Google Workspace integration: Sheets, Drive and Photos.
 *
 * Sheets + Drive use a service account (server-to-server). Share the target
 * spreadsheet and Drive root folder with the service account's email address.
 *
 * Google Photos Library API does not support service accounts, so it uses a
 * user OAuth refresh token (photoslibrary.appendonly scope).
 *
 * Every method degrades gracefully: if the relevant credentials are missing
 * it logs a warning and returns null instead of throwing, so the core drill
 * workflow keeps working even before Google is fully wired up.
 */

const SHEETS_HEADERS = [
  'Drill ID', 'Drill Name', 'Date', 'Timestamp', 'Email', 'SAYA',
  'Kelas/Tim', 'Lokasi Assembly', 'Jumlah Hadir Hari Ini', 'Jumlah Bersama Saya',
  'Nama Wali Kelas', 'Catatan', 'Latitude', 'Longitude', 'GeoAddress',
  'Photo URL', 'Last Update',
];

let serviceAuth = null;
function getServiceAuth() {
  if (serviceAuth) return serviceAuth;
  const keyFile = config.google.serviceAccountKeyFile;
  if (!keyFile || !fs.existsSync(keyFile)) return null;
  serviceAuth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return serviceAuth;
}

let photosClient = null;
function getPhotosOAuthClient() {
  if (photosClient) return photosClient;
  const { clientId, clientSecret, photos } = config.google;
  if (!clientId || !clientSecret || !photos.refreshToken) return null;
  photosClient = new OAuth2Client(clientId, clientSecret, config.google.redirectUri);
  photosClient.setCredentials({ refresh_token: photos.refreshToken });
  return photosClient;
}

// ─────────────────────────────────────────────────────────────
// Google Sheets
// ─────────────────────────────────────────────────────────────

/** Ensure the configured tab exists and has the header row. */
async function ensureSheet(sheets, spreadsheetId, tab) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
  }
  const range = `${tab}!A1:Q1`;
  const head = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  if (!head.data.values || head.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEETS_HEADERS] },
    });
  }
}

/** Build the 17-column row for a report, matching SHEETS_HEADERS order. */
export function reportToRow(report, drill) {
  return [
    drill?.id || report.drillId,
    drill?.name || '',
    drill?.date || '',
    report.submittedAt || '',
    report.reporterEmail || '',
    report.role === 'PENGHUNI' ? 'MENEMUKAN PENGHUNI' : 'WALI KELAS ATAU TEAM LEADER',
    report.className || '',
    report.assemblyPoint || '',
    report.rosterToday ?? '',
    report.headcount ?? '',
    report.waliName || '',
    report.notes || '',
    report.lat ?? '',
    report.lng ?? '',
    report.geoAddress || '',
    report.photoUrl || '',
    report.lastUpdatedAt || '',
  ];
}

/** Append a report row to the configured spreadsheet. Returns true on success. */
export async function appendReportRow(report, drill) {
  const auth = getServiceAuth();
  const { spreadsheetId, tab } = config.google.sheets;
  if (!auth || !spreadsheetId) {
    console.warn('[google.sheets] not configured — skipping append');
    return false;
  }
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureSheet(sheets, spreadsheetId, tab);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [reportToRow(report, drill)] },
    });
    return true;
  } catch (err) {
    console.error('[google.sheets] append failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Google Drive
// ─────────────────────────────────────────────────────────────

async function findOrCreateFolder(drive, name, parentId) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId ? `'${parentId}' in parents` : null,
  ].filter(Boolean).join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  if (res.data.files?.length) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  return created.data.id;
}

/**
 * Upload a team photo to Drive under:
 *   School Emergency Drills / <year> / <Drill Type> /
 * Returns { fileId, webViewLink } or null.
 */
export async function uploadPhotoToDrive({ buffer, mimeType, drill, report }) {
  const auth = getServiceAuth();
  const rootId = config.google.drive.rootFolderId;
  if (!auth || !rootId) {
    console.warn('[google.drive] not configured — skipping upload');
    return null;
  }
  try {
    const drive = google.drive({ version: 'v3', auth });
    const year = String(new Date(drill?.date || Date.now()).getFullYear());
    const typeFolderName = drill?.typeName || 'Other Drills';

    const yearId = await findOrCreateFolder(drive, year, rootId);
    const typeId = await findOrCreateFolder(drive, typeFolderName, yearId);

    const safe = (s) => String(s || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
    const ts = (report.submittedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    const filename = `${safe(drill?.name)}_${safe(report.className)}_${safe(report.reporterName)}_${ts}.jpg`;

    const { Readable } = await import('stream');
    const created = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [typeId],
        description: `lat:${report.lat} lng:${report.lng} ts:${report.submittedAt}`,
      },
      media: { mimeType: mimeType || 'image/jpeg', body: Readable.from(buffer) },
      fields: 'id, webViewLink, webContentLink',
    });
    // Make link viewable by anyone with the link (so the Sheet URL works).
    await drive.permissions.create({
      fileId: created.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return { fileId: created.data.id, webViewLink: created.data.webViewLink };
  } catch (err) {
    console.error('[google.drive] upload failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Google Photos
// ─────────────────────────────────────────────────────────────

async function photosRequest(client, accessToken, path, body) {
  const res = await fetch(`https://photoslibrary.googleapis.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Photos API ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function findOrCreatePhotosAlbum(accessToken, title) {
  // Apps can only list albums they created; create on miss.
  const list = await fetch(
    'https://photoslibrary.googleapis.com/v1/albums?pageSize=50',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then((r) => r.json());
  const found = list.albums?.find((a) => a.title === title);
  if (found) return found.id;
  const created = await photosRequest(null, accessToken, 'albums', {
    album: { title },
  });
  return created.id;
}

/**
 * Upload the compressed team photo to the school Google Photos album and
 * return the media item URL, or null if Photos is not configured.
 */
export async function uploadPhotoToGooglePhotos({ buffer, drill, report }) {
  const client = getPhotosOAuthClient();
  if (!client) {
    console.warn('[google.photos] not configured — skipping upload');
    return null;
  }
  try {
    const { token: accessToken } = await client.getAccessToken();
    const albumId = await findOrCreatePhotosAlbum(accessToken, config.google.photos.albumTitle);

    // Step 1: upload bytes -> upload token
    const uploadToken = await fetch(
      'https://photoslibrary.googleapis.com/v1/uploads',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'X-Goog-Upload-Content-Type': 'image/jpeg',
          'X-Goog-Upload-Protocol': 'raw',
        },
        body: buffer,
      }
    ).then((r) => r.text());

    // Step 2: create media item in album
    const description = [drill?.name, report.className, report.assemblyPoint]
      .filter(Boolean)
      .join(' · ');
    const result = await photosRequest(null, accessToken, 'mediaItems:batchCreate', {
      albumId,
      newMediaItems: [
        {
          description,
          simpleMediaItem: { uploadToken, fileName: `${report.className || 'team'}.jpg` },
        },
      ],
    });
    const item = result.newMediaItemResults?.[0]?.mediaItem;
    return item ? { id: item.id, url: item.productUrl } : null;
  } catch (err) {
    console.error('[google.photos] upload failed:', err.message);
    return null;
  }
}

export function googleStatus() {
  return {
    sheets: Boolean(getServiceAuth() && config.google.sheets.spreadsheetId),
    drive: Boolean(getServiceAuth() && config.google.drive.rootFolderId),
    photos: Boolean(getPhotosOAuthClient()),
    maps: Boolean(config.google.mapsApiKey),
    signIn: Boolean(config.google.clientId),
  };
}
