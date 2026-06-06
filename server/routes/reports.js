import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../config.js';
import { db, now } from '../store.js';
import { requireAuth, requireRole, audit } from '../middleware.js';
import { computeStats } from '../services/stats.js';
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

/** Parse numeric attendance fields and derive the canonical missing count. */
function attendance(body) {
  const assigned = Math.max(Number(body.assigned) || 0, 0);
  const present = Math.min(Math.max(Number(body.present) || 0, 0), assigned);
  return { assigned, present, missing: assigned - present };
}

const CONDITIONS = ['All Safe', 'Minor Injuries', 'Serious Injuries', 'Medical Assistance Required'];

/** Push a fresh report row to Google Sheets + upload photo to Drive/Photos. */
async function syncToGoogle(report, drill, photo) {
  if (photo?.buffer) {
    const [drive, photos] = await Promise.all([
      uploadPhotoToDrive({ buffer: photo.buffer, mimeType: photo.mimetype, drill, report }),
      uploadPhotoToGooglePhotos({ buffer: photo.buffer, drill, report }),
    ]);
    const url = drive?.webViewLink || photos?.url || report.photoUrl || '';
    if (url || drive || photos) {
      db.updateReport(report.id, {
        photoUrl: url,
        photoDriveId: drive?.fileId || '',
        photosUrl: photos?.url || '',
      });
      report = db.findReport(report.id);
    }
  }
  await appendReportRow(report, drill);
}

// ─────────────── List / read ───────────────

/** Reports for a drill (coordinators/admins see all; teachers see their own). */
router.get('/drill/:drillId', (req, res) => {
  let reports = db.reportsForDrill(req.params.drillId);
  if (req.user.role === ROLES.TEACHER) {
    reports = reports.filter((r) => r.teacherId === req.user.id);
  }
  res.json(reports);
});

/** The current user's report for a drill (used to decide submit vs edit). */
router.get('/mine/:drillId', (req, res) => {
  res.json(db.findReportByTeacher(req.params.drillId, req.user.id) || null);
});

router.get('/:id', (req, res) => {
  const r = db.findReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found.' });
  if (req.user.role === ROLES.TEACHER && r.teacherId !== req.user.id) {
    return res.status(403).json({ error: 'Not your report.' });
  }
  res.json(r);
});

// ─────────────── Submit (one per teacher per drill) ───────────────

router.post('/', upload.single('photo'), async (req, res) => {
  const drill = db.findDrill(req.body.drillId);
  if (!drill) return res.status(404).json({ error: 'Drill not found.' });
  if (drill.status !== 'Active') {
    return res.status(409).json({ error: 'Reports can only be submitted while the drill is Active.' });
  }

  // Duplicate prevention: one report per teacher per drill.
  if (db.findReportByTeacher(drill.id, req.user.id)) {
    return res.status(409).json({ error: 'You have already submitted a report for this drill. Edit it instead.' });
  }

  const condition = CONDITIONS.includes(req.body.condition) ? req.body.condition : 'All Safe';
  const { assigned, present, missing } = attendance(req.body);
  const ap = db.assemblyPoints().find((a) => a.id === (req.body.assemblyPointId || req.user.assemblyPointId));

  const report = db.addReport({
    drillId: drill.id,
    teacherId: req.user.id,
    teacherName: req.user.name,
    employeeId: req.user.employeeId || req.body.employeeId || '',
    teamName: req.user.teamName || req.body.teamName || '',
    assemblyPointId: ap?.id || '',
    assemblyPointName: ap?.name || req.body.assemblyPointName || '',
    lat: req.body.lat ? Number(req.body.lat) : null,
    lng: req.body.lng ? Number(req.body.lng) : null,
    accuracy: req.body.accuracy ? Number(req.body.accuracy) : null,
    gpsTimestamp: req.body.gpsTimestamp || now(),
    assigned, present, missing,
    condition,
    conditionNotes: condition === 'All Safe' ? '' : (req.body.conditionNotes || ''),
    missingStudents: req.body.missingStudents || '',
    injuredStudents: req.body.injuredStudents || '',
    observations: req.body.observations || '',
    photoUrl: '',
    submittedAt: now(),
    lastUpdatedAt: now(),
    editorName: req.user.name,
    revisions: [],
  });

  audit(req, 'SUBMIT_REPORT', { drillId: drill.id, reportId: report.id });
  emitToAll('report:update', report);
  emitToAll('stats:update', computeStats(drill));

  // Notifications for noteworthy conditions.
  await notify('REPORT_SUBMITTED', `${report.teamName} (${report.teacherName}) reported in.`, {
    severity: 'info', drillId: drill.id, emailRoles: [],
  });
  if (missing > 0) {
    await notify('MISSING_REPORTED', `${missing} missing in ${report.teamName} (${report.teacherName}).`, {
      severity: 'critical', drillId: drill.id, emailRoles: NOTIFY_ROLES.COORDINATORS,
    });
  }
  if (condition !== 'All Safe') {
    await notify('INJURY_REPORTED', `${report.teamName}: ${condition}.`, {
      severity: 'warning', drillId: drill.id, emailRoles: NOTIFY_ROLES.COORDINATORS,
    });
  }

  // Fire-and-forget Google sync so the teacher gets an instant response.
  syncToGoogle(report, drill, req.file).catch((e) => console.error('google sync:', e.message));

  res.status(201).json(report);
});

// ─────────────── Edit (with revision history) ───────────────

router.put('/:id', upload.single('photo'), async (req, res) => {
  const report = db.findReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  const isOwner = report.teacherId === req.user.id;
  const isAdmin = req.user.role === ROLES.SUPER_ADMIN;
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Only the author or a super administrator can edit this report.' });
  }

  const drill = db.findDrill(report.drillId);

  // Snapshot current state into revision history before mutating.
  const revision = {
    editedAt: now(),
    editorName: req.user.name,
    editorId: req.user.id,
    snapshot: {
      assigned: report.assigned, present: report.present, missing: report.missing,
      condition: report.condition, conditionNotes: report.conditionNotes,
      missingStudents: report.missingStudents, injuredStudents: report.injuredStudents,
      observations: report.observations,
      lat: report.lat, lng: report.lng,
    },
  };

  const condition = CONDITIONS.includes(req.body.condition) ? req.body.condition : report.condition;
  const { assigned, present, missing } = attendance({
    assigned: req.body.assigned ?? report.assigned,
    present: req.body.present ?? report.present,
  });

  const patch = {
    assigned, present, missing, condition,
    conditionNotes: condition === 'All Safe' ? '' : (req.body.conditionNotes ?? report.conditionNotes),
    missingStudents: req.body.missingStudents ?? report.missingStudents,
    injuredStudents: req.body.injuredStudents ?? report.injuredStudents,
    observations: req.body.observations ?? report.observations,
    lat: req.body.lat ? Number(req.body.lat) : report.lat,
    lng: req.body.lng ? Number(req.body.lng) : report.lng,
    accuracy: req.body.accuracy ? Number(req.body.accuracy) : report.accuracy,
    lastUpdatedAt: now(),
    editorName: req.user.name,
    revisions: [...(report.revisions || []), revision],
  };

  const updated = db.updateReport(report.id, patch);
  audit(req, 'EDIT_REPORT', { reportId: report.id, editor: req.user.email });
  emitToAll('report:update', updated);
  if (drill) emitToAll('stats:update', computeStats(drill));

  if (missing > 0) {
    await notify('MISSING_REPORTED', `${missing} missing in ${updated.teamName} (updated).`, {
      severity: 'critical', drillId: updated.drillId, emailRoles: NOTIFY_ROLES.COORDINATORS,
    });
  }

  syncToGoogle(updated, drill, req.file).catch((e) => console.error('google sync:', e.message));
  res.json(updated);
});

export default router;
