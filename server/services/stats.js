import { db } from '../store.js';
import { ROLES as R } from '../config.js';

/**
 * Per-class reconciliation, mirroring the school's spreadsheet logic.
 * For each class: roster (students present today, from the wali kelas) vs the
 * sum of headcounts reported across all assembly points. Status:
 *   LENGKAP (counted == roster), KURANG (counted < roster), LEBIH (counted > roster).
 */
export function classReconciliation(drillId) {
  const reports = db.reportsForDrill(drillId);
  const byClass = new Map();

  for (const r of reports) {
    const key = (r.className || '—').toUpperCase();
    if (!byClass.has(key)) {
      byClass.set(key, { className: key, waliName: '', roster: 0, counted: 0, byAP: {}, reports: 0, hasRoster: false });
    }
    const c = byClass.get(key);
    c.reports += 1;
    c.counted += Number(r.headcount) || 0;
    const ap = r.assemblyPoint || '—';
    c.byAP[ap] = (c.byAP[ap] || 0) + (Number(r.headcount) || 0);
    if (r.role === 'WALI_KELAS') {
      c.hasRoster = true;
      c.roster = Math.max(c.roster, Number(r.rosterToday) || 0);
      if (r.waliName) c.waliName = r.waliName;
    }
  }

  return [...byClass.values()].map((c) => {
    const diff = c.counted - c.roster;
    let status = 'MENUNGGU'; // awaiting the wali kelas roster
    if (c.hasRoster) status = diff === 0 ? 'LENGKAP' : diff < 0 ? 'KURANG' : 'LEBIH';
    return { ...c, diff, status };
  }).sort((a, b) => a.className.localeCompare(b.className));
}

/** Live dashboard statistics for a drill (or the active drill). */
export function computeStats(drill) {
  const target = drill || db.activeDrill();
  const users = db.users();
  const staff = users.filter((u) => u.role !== R.TEACHER);

  const classes = target ? classReconciliation(target.id) : [];
  const reports = target ? db.reportsForDrill(target.id) : [];

  const totalRoster = classes.reduce((s, c) => s + c.roster, 0);
  const totalCounted = classes.reduce((s, c) => s + c.counted, 0);
  const missing = classes.reduce((s, c) => s + (c.hasRoster ? Math.max(c.roster - c.counted, 0) : 0), 0);
  const excess = classes.reduce((s, c) => s + (c.hasRoster ? Math.max(c.counted - c.roster, 0) : 0), 0);

  const classesReported = classes.length;
  const classesComplete = classes.filter((c) => c.status === 'LENGKAP').length;
  const classesShort = classes.filter((c) => c.status === 'KURANG').length;

  const accountedPct = totalRoster > 0
    ? Math.round((Math.min(totalCounted, totalRoster) / totalRoster) * 100)
    : 0;

  return {
    totalRoster,       // total students present today (sum of class rosters)
    totalCounted,      // total accounted for across assembly points
    missing,           // KURANG total
    excess,            // LEBIH total
    classesReported,
    classesComplete,
    classesShort,
    reportsCount: reports.length,
    totalStaff: staff.length,
    accountedPct,
    drill: target
      ? { id: target.id, name: target.name, status: target.status, type: target.typeName || target.type }
      : null,
  };
}
