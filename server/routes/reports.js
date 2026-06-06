import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../config.js';
import { db, now } from '../store.js';
import { requireAuth, audit } from '../middleware.js';
import { computeStats, classReconciliation } from '../services/stats.js';
import { notify, NOTIFY_ROLES } from '../services/notifications.js';
import {
  appendReportRow,
  uploadPhotoToDrive,
  uploadPhotoToGooglePhotos,
} from '../services/google.js';
import { emitToAll } from '../realtime.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB hard cap; client compresses to <=200 KB
});

const router = Router();
router.use(requireAuth);

const ROLE_VALUES = ['WALI_KELAS', 'PENGHUNI']; // SAYA: wali kelas/team leader, or found occupants

/** Upload photo to Drive/Photos then append the report row to Google Sheets. */
async function syncToGoogle(report, drill, photo) {
  if (photo?.buffer) {
    const [drive, photos] = await Promise.all([
      uploadPhotoToDrive({ buffer: photo.buffer, mimeType: photo.mimetype, drill, report }),
      uploadPhotoToGooglePhotos({ buffer: photo.buffer, drill, report }),
    ]);
    const url = drive?.webViewLink || photos?.url || report.photoUrl || '';
    if (url || drive || photos) {
      db.updateReport(report.id, { photoUrl: url, photoDriveId: drive?.fileId || '', photosUrl: photos?.url || '' });
      report = db.findReport(report.id);
    }
  }
  await appendReportRow(report, drill);
}

/** Normalise the submitted report fields from the form body. */
function parseReport(body, user) {
  const role = ROLE_VALUES.includes(body.role) ? body.role : 'WALI_KELAS';
  const headcount = Math.max(Number(body.headcount) || 0, 0);
  const rosterToday = role === 'WALI_KELAS' ? Math.max(Number(body.rosterToday) || 0, 0) : 0;
  return {
    role,
    className: (body.className || '').trim(),
    assemblyPoint: (body.assemblyPoint || '').trim(),
    headcount,
    rosterToday,
    waliName: role === 'WALI_KELAS' ? (body.waliName || user.name || '').trim() : '',
    notes: (body.notes || '').trim(),
    lat: body.lat ? Number(body.lat) : null,
    lng: body.lng ? Number(body.lng) : null,
    accuracy: body.accuracy ? Number(body.accuracy) : null,
    geoAddress: body.geoAddress || '',
    gpsTimestamp: body.gpsTimestamp || now(),
  };
}

// ─────────────── List / read ───────────────

/** Reports for a drill (teachers see only their own submissions). */
router.get('/drill/:drillId', (req, res) => {
  let reports = db.reportsForDrill(req.params.drillId);
  if (req.user.role === ROLES.TEACHER) reports = reports.filter((r) => r.reporterId === req.user.id);
  res.json(reports);
});

/** Per-class reconciliation (LENGKAP / KURANG / LEBIH) for a drill. */
router.get('/reconcile/:drillId', (req, res) => {
  res.json(classReconciliation(req.params.drillId));
});

/** All of the current user's submissions for a drill (they may file several). */
router.get('/mine/:drillId', (req, res) => {
  res.json(db.reportsForDrill(req.params.drillId).filter((r) => r.reporterId === req.user.id));
});

router.get('/:id', (req, res) => {
  const r = db.findReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found.' });
  if (req.user.role === ROLES.TEACHER && r.reporterId !== req.user.id) {
    return res.status(403).json({ error: 'Not your report.' });
  }
  res.json(r);
});

// ─────────────── Submit (multiple allowed — one per class/assembly point) ───────────────

router.post('/', upload.single('photo'), async (req, res) => {
  const drill = db.findDrill(req.body.drillId);
  if (!drill) return res.status(404).json({ error: 'Drill not found.' });
  if (drill.status !== 'Active') {
    return res.status(409).json({ error: 'Laporan hanya dapat dikirim saat latihan berstatus Aktif.' });
  }

  const f = parseReport(req.body, req.user);
  if (!f.className) return res.status(400).json({ error: 'Kelas / Tim wajib diisi.' });
  if (!f.assemblyPoint) return res.status(400).json({ error: 'Lokasi Assembly wajib dipilih.' });

  const report = db.addReport({
    drillId: drill.id,
    reporterId: req.user.id,
    reporterName: req.user.name,
    reporterEmail: req.user.email,
    ...f,
    photoUrl: '',
    submittedAt: now(),
    lastUpdatedAt: now(),
    editorName: req.user.name,
    revisions: [],
  });

  audit(req, 'SUBMIT_REPORT', { drillId: drill.id, reportId: report.id, class: f.className });
  emitToAll('report:update', report);
  emitToAll('stats:update', computeStats(drill));

  const roleLabel = f.role === 'WALI_KELAS' ? 'Wali Kelas' : 'Penemu';
  await notify('REPORT_SUBMITTED', `${roleLabel} melaporkan ${f.className} di ${f.assemblyPoint} (${f.headcount} orang).`, {
    severity: 'info', drillId: drill.id, emailRoles: [],
  });

  // After aggregation, alert coordinators if this class is now short (KURANG).
  const cls = classReconciliation(drill.id).find((c) => c.className === f.className);
  if (cls && cls.status === 'KURANG') {
    await notify('MISSING_REPORTED', `Kelas ${f.className} KURANG ${Math.abs(cls.diff)} (tercatat ${cls.counted} dari ${cls.roster}).`, {
      severity: 'critical', drillId: drill.id, emailRoles: NOTIFY_ROLES.COORDINATORS,
    });
  }

  syncToGoogle(report, drill, req.file).catch((e) => console.error('google sync:', e.message));
  res.status(201).json(report);
});

// ─────────────── Edit (author or admin; keeps revision history) ───────────────

router.put('/:id', upload.single('photo'), async (req, res) => {
  const report = db.findReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  const isOwner = report.reporterId === req.user.id;
  const isAdmin = req.user.role === ROLES.SUPER_ADMIN;
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Hanya pembuat atau administrator yang dapat mengubah laporan ini.' });
  }
  const drill = db.findDrill(report.drillId);

  const revision = {
    editedAt: now(), editorName: req.user.name, editorId: req.user.id,
    snapshot: {
      role: report.role, className: report.className, assemblyPoint: report.assemblyPoint,
      headcount: report.headcount, rosterToday: report.rosterToday, waliName: report.waliName,
      notes: report.notes, lat: report.lat, lng: report.lng,
    },
  };

  const f = parseReport({ ...report, ...req.body }, req.user);
  const updated = db.updateReport(report.id, {
    ...f,
    lastUpdatedAt: now(),
    editorName: req.user.name,
    revisions: [...(report.revisions || []), revision],
  });

  audit(req, 'EDIT_REPORT', { reportId: report.id, editor: req.user.email });
  emitToAll('report:update', updated);
  if (drill) emitToAll('stats:update', computeStats(drill));

  syncToGoogle(updated, drill, req.file).catch((e) => console.error('google sync:', e.message));
  res.json(updated);
});

export default router;
