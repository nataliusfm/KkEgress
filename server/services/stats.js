import { db } from '../store.js';
import { ROLES as R } from '../config.js';

/**
 * Compute live dashboard statistics for a drill (or the active drill).
 * Returns the full set required by the dashboard spec.
 */
export function computeStats(drill) {
  const target = drill || db.activeDrill();
  const users = db.users();

  const teachers = users.filter((u) => u.role === R.TEACHER);
  const staff = users.filter((u) => u.role !== R.TEACHER);

  const reports = target ? db.reportsForDrill(target.id) : [];

  const totalAssigned = reports.reduce((s, r) => s + (Number(r.assigned) || 0), 0);
  const evacuated = reports.reduce((s, r) => s + (Number(r.present) || 0), 0);
  const missing = reports.reduce((s, r) => s + (Number(r.missing) || 0), 0);

  const safe = reports.filter((r) => r.condition === 'All Safe').length;
  const injured = reports.filter(
    (r) => r.condition === 'Minor Injuries' || r.condition === 'Serious Injuries'
  ).length;
  const medical = reports.filter((r) => r.condition === 'Medical Assistance Required').length;

  // "Teams" = teachers expected to report. Fall back to count of reports if no
  // teacher accounts have been configured yet.
  const totalTeams = teachers.length || reports.length;
  const teamsReported = reports.length;
  const notYetReported = Math.max(totalTeams - teamsReported, 0);

  const completionPct = totalTeams > 0
    ? Math.round((teamsReported / totalTeams) * 100)
    : 0;

  return {
    totalStudents: teachers.reduce((s, t) => s + (Number(t.assignedStudents) || 0), 0) || totalAssigned,
    totalStaff: staff.length,
    totalTeams,
    evacuated,
    notYetReported,
    safe,
    injured,
    missing,
    medical,
    teamsReported,
    totalAssigned,
    completionPct,
    drill: target
      ? { id: target.id, name: target.name, status: target.status, type: target.typeName || target.type }
      : null,
  };
}
