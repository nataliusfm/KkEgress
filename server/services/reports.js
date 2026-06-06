import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { db } from '../store.js';
import { computeStats } from './stats.js';

const SHEET_COLUMNS = [
  { header: 'Drill ID', key: 'drillId', width: 38 },
  { header: 'Drill Name', key: 'drillName', width: 20 },
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Teacher Name', key: 'teacherName', width: 20 },
  { header: 'Employee ID', key: 'employeeId', width: 14 },
  { header: 'Team/Class', key: 'teamName', width: 16 },
  { header: 'Assembly Point', key: 'assemblyPointName', width: 18 },
  { header: 'Latitude', key: 'lat', width: 12 },
  { header: 'Longitude', key: 'lng', width: 12 },
  { header: 'Assigned', key: 'assigned', width: 10 },
  { header: 'Present', key: 'present', width: 10 },
  { header: 'Missing', key: 'missing', width: 10 },
  { header: 'Condition', key: 'condition', width: 20 },
  { header: 'Notes', key: 'conditionNotes', width: 30 },
  { header: 'Photo URL', key: 'photoUrl', width: 30 },
  { header: 'Submission Timestamp', key: 'submittedAt', width: 24 },
  { header: 'Last Update Timestamp', key: 'lastUpdatedAt', width: 24 },
];

/** Generate an .xlsx workbook of a drill's reports. Returns a Buffer. */
export async function buildExcel(drillId) {
  const drill = db.findDrill(drillId);
  const reports = drillId ? db.reportsForDrill(drillId) : db.reports();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'School Emergency Drill System';
  const ws = wb.addWorksheet('Drill Records');
  ws.columns = SHEET_COLUMNS;
  ws.getRow(1).font = { bold: true };

  for (const r of reports) {
    ws.addRow({
      ...r,
      drillName: drill?.name || '',
      date: drill?.date || '',
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Generate a PDF summary report for a drill. Returns a Promise<Buffer>. */
export function buildPdf(drillId, { mapSnapshot, coordinatorComments } = {}) {
  return new Promise((resolve, reject) => {
    const drill = db.findDrill(drillId);
    if (!drill) return reject(new Error('Drill not found'));
    const reports = db.reportsForDrill(drillId);
    const school = db.getSchool();
    const stats = computeStats(drill);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const h = (t) => doc.moveDown(0.6).fontSize(14).fillColor('#1a3c6e').text(t).fillColor('#000').fontSize(10).moveDown(0.2);

    // Title
    doc.fontSize(20).fillColor('#1a3c6e').text('Emergency Drill Report', { align: 'center' });
    doc.moveDown(0.2).fontSize(11).fillColor('#555').text(school.name, { align: 'center' });
    if (school.address) doc.fontSize(9).text(school.address, { align: 'center' });
    doc.fillColor('#000').moveDown();

    // Drill details
    h('Drill Details');
    doc.text(`Name: ${drill.name}`);
    doc.text(`Type: ${drill.typeName || drill.type}`);
    doc.text(`Date: ${drill.date}    Start Time: ${drill.startTime || '-'}`);
    doc.text(`Status: ${drill.status}`);
    doc.text(`Coordinator: ${drill.coordinatorName || '-'}`);
    if (drill.notes) doc.text(`Notes: ${drill.notes}`);

    // Attendance summary
    h('Attendance Summary');
    doc.text(`Teams reported: ${stats.teamsReported} / ${stats.totalTeams}`);
    doc.text(`Total assigned: ${stats.totalAssigned}`);
    doc.text(`Present (evacuated): ${stats.evacuated}`);
    doc.text(`Missing: ${stats.missing}`);
    doc.text(`Safe: ${stats.safe}    Injured: ${stats.injured}`);
    doc.text(`Drill completion: ${stats.completionPct}%`);

    // Missing persons
    const missingNames = reports.flatMap((r) =>
      (r.missingStudents || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    );
    h('Missing Persons');
    doc.text(missingNames.length ? missingNames.join(', ') : 'None reported.');

    // Injuries
    const injured = reports.filter((r) => r.condition && r.condition !== 'All Safe');
    h('Injury / Condition Reports');
    if (injured.length === 0) doc.text('No injuries reported.');
    injured.forEach((r) => {
      doc.text(`• ${r.teamName} (${r.teacherName}): ${r.condition}` +
        (r.conditionNotes ? ` — ${r.conditionNotes}` : ''));
    });

    // Per-team table
    h('Team Reports');
    reports.forEach((r) => {
      doc.font('Helvetica-Bold').text(`${r.teamName} — ${r.teacherName}`);
      doc.font('Helvetica').text(
        `Assembly: ${r.assemblyPointName || '-'} | Assigned ${r.assigned}, ` +
        `Present ${r.present}, Missing ${r.missing} | ${r.condition} | ` +
        `GPS ${r.lat ?? '-'}, ${r.lng ?? '-'} | Submitted ${r.submittedAt || '-'}`
      );
      doc.moveDown(0.3);
    });

    // Map snapshot (data URL) if provided
    if (mapSnapshot && mapSnapshot.startsWith('data:image')) {
      try {
        h('Map Snapshot');
        const b64 = mapSnapshot.split(',')[1];
        doc.image(Buffer.from(b64, 'base64'), { fit: [500, 300], align: 'center' });
      } catch { /* ignore bad image */ }
    }

    if (coordinatorComments) {
      h('Coordinator Comments');
      doc.text(coordinatorComments);
    }

    doc.moveDown().fontSize(8).fillColor('#999')
      .text(`Generated ${new Date().toLocaleString()}`, { align: 'right' });

    doc.end();
  });
}
