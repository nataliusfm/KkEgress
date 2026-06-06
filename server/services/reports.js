import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { db } from '../store.js';
import { computeStats, classReconciliation } from './stats.js';

const SAYA = (role) => (role === 'PENGHUNI' ? 'MENEMUKAN PENGHUNI' : 'WALI KELAS ATAU TEAM LEADER');

const REPORT_COLUMNS = [
  { header: 'Timestamp', key: 'submittedAt', width: 22 },
  { header: 'Email', key: 'reporterEmail', width: 24 },
  { header: 'SAYA', key: 'saya', width: 26 },
  { header: 'Kelas/Tim', key: 'className', width: 12 },
  { header: 'Lokasi Assembly', key: 'assemblyPoint', width: 18 },
  { header: 'Jumlah Hadir Hari Ini', key: 'rosterToday', width: 18 },
  { header: 'Jumlah Bersama Saya', key: 'headcount', width: 18 },
  { header: 'Nama Wali Kelas', key: 'waliName', width: 18 },
  { header: 'Catatan', key: 'notes', width: 28 },
  { header: 'Latitude', key: 'lat', width: 12 },
  { header: 'Longitude', key: 'lng', width: 12 },
  { header: 'GeoAddress', key: 'geoAddress', width: 30 },
  { header: 'Photo URL', key: 'photoUrl', width: 28 },
];

/** Generate an .xlsx workbook: raw responses + per-class reconciliation. */
export async function buildExcel(drillId) {
  const drill = db.findDrill(drillId);
  const reports = drillId ? db.reportsForDrill(drillId) : db.reports();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kuala Kencana Drill';

  const ws = wb.addWorksheet('Response Evakuasi');
  ws.columns = REPORT_COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const r of reports) ws.addRow({ ...r, saya: SAYA(r.role) });

  if (drillId) {
    const rec = wb.addWorksheet('Penghitungan');
    rec.columns = [
      { header: 'GRP', key: 'className', width: 12 },
      { header: 'Wali Kelas', key: 'waliName', width: 18 },
      { header: 'Tercatat', key: 'counted', width: 12 },
      { header: 'Hadir Hari Ini', key: 'roster', width: 14 },
      { header: 'Selisih', key: 'diff', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    rec.getRow(1).font = { bold: true };
    for (const c of classReconciliation(drillId)) rec.addRow(c);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Generate a PDF summary for a drill. Returns a Promise<Buffer>. */
export function buildPdf(drillId, { mapSnapshot, coordinatorComments } = {}) {
  return new Promise((resolve, reject) => {
    const drill = db.findDrill(drillId);
    if (!drill) return reject(new Error('Drill not found'));
    const school = db.getSchool();
    const stats = computeStats(drill);
    const classes = classReconciliation(drillId);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const h = (t) => doc.moveDown(0.6).fontSize(13).fillColor('#1a3c6e').text(t).fillColor('#000').fontSize(10).moveDown(0.2);

    doc.fontSize(19).fillColor('#1a3c6e').text('Laporan Latihan Evakuasi', { align: 'center' });
    doc.moveDown(0.2).fontSize(11).fillColor('#555').text(school.name, { align: 'center' });
    if (school.address) doc.fontSize(9).text(school.address, { align: 'center' });
    doc.fillColor('#000').moveDown();

    h('Detail Latihan');
    doc.text(`Nama: ${drill.name}`);
    doc.text(`Jenis: ${drill.typeName || drill.type}`);
    doc.text(`Tanggal: ${drill.date}    Mulai: ${drill.startTime || '-'}`);
    doc.text(`Status: ${drill.status}`);

    h('Ringkasan');
    doc.text(`Total hadir hari ini (roster): ${stats.totalRoster}`);
    doc.text(`Total tercatat (terevakuasi): ${stats.totalCounted}`);
    doc.text(`Kurang: ${stats.missing}    Lebih: ${stats.excess}`);
    doc.text(`Kelas melapor: ${stats.classesReported}  |  Lengkap: ${stats.classesComplete}  |  Kurang: ${stats.classesShort}`);
    doc.text(`Tercatat: ${stats.accountedPct}% dari roster`);

    h('Penghitungan per Kelas');
    doc.font('Helvetica-Bold').text('GRP    Wali        Tercatat / Hadir    Status');
    doc.font('Helvetica');
    classes.forEach((c) => {
      doc.text(`${c.className}    ${c.waliName || '-'}    ${c.counted} / ${c.roster}    ${c.status}` +
        (c.diff ? ` (${c.diff > 0 ? '+' : ''}${c.diff})` : ''));
    });

    const short = classes.filter((c) => c.status === 'KURANG');
    h('Kelas Kurang (Perlu Tindakan)');
    if (!short.length) doc.text('Tidak ada — semua kelas lengkap.');
    short.forEach((c) => doc.text(`• ${c.className}: kurang ${Math.abs(c.diff)} (tercatat ${c.counted} dari ${c.roster})`));

    if (mapSnapshot && mapSnapshot.startsWith('data:image')) {
      try { h('Peta'); doc.image(Buffer.from(mapSnapshot.split(',')[1], 'base64'), { fit: [500, 300], align: 'center' }); }
      catch { /* ignore */ }
    }
    if (coordinatorComments) { h('Catatan Koordinator'); doc.text(coordinatorComments); }

    doc.moveDown().fontSize(8).fillColor('#999').text(`Dibuat ${new Date().toLocaleString()}`, { align: 'right' });
    doc.end();
  });
}
