// Shared bilingual (EN/ID) dictionary + tiny helper, used by the shell and views.
const DICT = {
  en: {
    // shell
    'nav.dashboard': 'Dashboard', 'nav.map': 'Live Map', 'nav.report': 'My Report',
    'nav.monitor': 'Team Monitor', 'nav.drills': 'Drills', 'nav.reports': 'Reports', 'nav.admin': 'Administration',
    'sec.navigation': 'NAVIGATION', 'sec.language': 'LANGUAGE', 'sec.signedInAs': 'SIGNED IN AS',
    'action.signout': 'Sign out', 'login.signin': 'Sign In', 'login.email': 'Email address', 'login.password': 'Password',
    'cta.drills': 'Start Drill', 'cta.monitor': 'Open Monitor', 'cta.report': 'Submit Report',
    'eyebrow.dashboard': 'OVERVIEW', 'title.dashboard': 'Drill dashboard',
    'eyebrow.map': 'TRACKING', 'title.map': 'Live map',
    'eyebrow.report': 'FIELD REPORT', 'title.report': 'My report',
    'eyebrow.monitor': 'REAL-TIME', 'title.monitor': 'Evacuation count',
    'eyebrow.drills': 'MANAGEMENT', 'title.drills': 'Emergency drills',
    'eyebrow.reports': 'RECORDS', 'title.reports': 'Reports & exports',
    'eyebrow.admin': 'SETTINGS', 'title.admin': 'Administration',
    // status
    'st.LENGKAP': 'COMPLETE', 'st.KURANG': 'SHORT', 'st.LEBIH': 'OVER', 'st.MENUNGGU': 'AWAITING',
    'role.WALI': 'Class Teacher', 'role.PENGHUNI': 'Finder',
    'role.WALI_FULL': 'CLASS TEACHER / TEAM LEADER', 'role.PENGHUNI_FULL': 'FOUND OCCUPANTS',
    // report form
    'rep.noDrill': 'No active drill', 'rep.noDrillBody': 'The report form appears when an administrator starts a drill.',
    'rep.iam': 'I AM', 'rep.class': 'My class / team', 'rep.classPh': 'e.g. 9A',
    'rep.ap': 'My assembly location', 'rep.pick': '— select —',
    'rep.roster': 'My students/team present today (number)',
    'rep.headcount': 'Students/team with me now (number)',
    'rep.wali': 'Class teacher / group leader name',
    'rep.notes': 'Notes (optional — injuries, missing students, observations)',
    'rep.gps': 'GPS location', 'rep.refresh': 'Refresh', 'rep.gpsGet': 'Getting location…',
    'rep.gpsAcc': 'Accuracy', 'rep.gpsErr': 'Location error',
    'rep.photo': 'Photo (optional)', 'rep.photoPick': 'Capture / choose photo',
    'rep.compress': 'Compressing…', 'rep.ready': 'Ready',
    'rep.submit': 'Submit Report', 'rep.save': 'Save Changes',
    'rep.mine': 'My Reports', 'rep.count': '{n} reports', 'rep.none': 'No reports yet.',
    'rep.edit': 'Edit', 'rep.people': 'people', 'rep.present': 'present',
    'rep.needClass': 'Class / Team is required.', 'rep.needAp': 'Please choose an assembly location.',
    'rep.editing': 'Editing report for {class} · {ap}.',
    'rep.sent': '✓ Report submitted.', 'rep.saved': '✓ Changes saved.', 'rep.savedToast': 'Report saved.',
    'rep.offline': 'Saved offline. Will sync automatically when back online.',
    // dashboard
    'dash.stats': 'Live Statistics', 'dash.countVsRoster': 'Counted vs Roster', 'dash.map': 'Live Map',
    'dash.legendComplete': 'Complete', 'dash.legendShort': 'Short', 'dash.legendAp': 'Assembly point', 'dash.legendSchool': 'School',
    'dash.noDrill': 'No active drill. Statistics appear when a drill starts.',
    'dash.updated': 'updated {time}',
    'dash.totalRoster': 'Total Present (Roster)', 'dash.counted': 'Counted (Evacuated)',
    'dash.short': 'Short', 'dash.over': 'Over', 'dash.classesReported': 'Classes Reporting',
    'dash.classesComplete': 'Classes Complete', 'dash.classesShort': 'Classes Short', 'dash.reports': 'Reports In',
    'dash.progress': '{pct}% counted — {counted}/{roster} students, {complete}/{reported} classes complete',
    // monitor
    'mon.title': 'Evacuation Count', 'mon.grp': 'GRP', 'mon.wali': 'Class Teacher',
    'mon.counted': 'Counted', 'mon.present': 'Present', 'mon.diff': 'Diff', 'mon.status': 'Status',
    'mon.loading': 'Loading…', 'mon.none': 'No reports yet.', 'mon.noDrill': 'No drills yet.',
    'mon.banner': 'No active drill — showing the most recent drill if available.',
    // reports/export
    'exp.title': 'Reports & Exports', 'exp.pick': 'Select Drill', 'exp.comments': 'Coordinator comments (included in PDF)',
    'exp.pdf': 'PDF Report', 'exp.excel': 'Excel Export', 'exp.excelAll': 'Export All Data',
    'exp.perClass': 'Per-class Count', 'exp.audit': 'Audit Trail',
    'common.updated': 'updated', 'common.time': 'Time', 'common.user': 'User', 'common.action': 'Action',
  },
  id: {
    'nav.dashboard': 'Dasbor', 'nav.map': 'Peta Langsung', 'nav.report': 'Laporan Saya',
    'nav.monitor': 'Pemantauan Tim', 'nav.drills': 'Latihan', 'nav.reports': 'Laporan', 'nav.admin': 'Administrasi',
    'sec.navigation': 'NAVIGASI', 'sec.language': 'BAHASA', 'sec.signedInAs': 'MASUK SEBAGAI',
    'action.signout': 'Keluar', 'login.signin': 'Masuk', 'login.email': 'Alamat email', 'login.password': 'Kata sandi',
    'cta.drills': 'Mulai Latihan', 'cta.monitor': 'Buka Pemantauan', 'cta.report': 'Kirim Laporan',
    'eyebrow.dashboard': 'IKHTISAR', 'title.dashboard': 'Dasbor latihan',
    'eyebrow.map': 'PELACAKAN', 'title.map': 'Peta langsung',
    'eyebrow.report': 'LAPORAN LAPANGAN', 'title.report': 'Laporan saya',
    'eyebrow.monitor': 'WAKTU NYATA', 'title.monitor': 'Penghitungan evakuasi',
    'eyebrow.drills': 'MANAJEMEN', 'title.drills': 'Latihan darurat',
    'eyebrow.reports': 'CATATAN', 'title.reports': 'Laporan & ekspor',
    'eyebrow.admin': 'PENGATURAN', 'title.admin': 'Administrasi',
    'st.LENGKAP': 'LENGKAP', 'st.KURANG': 'KURANG', 'st.LEBIH': 'LEBIH', 'st.MENUNGGU': 'MENUNGGU',
    'role.WALI': 'Wali', 'role.PENGHUNI': 'Penemu',
    'role.WALI_FULL': 'WALI KELAS ATAU TEAM LEADER', 'role.PENGHUNI_FULL': 'MENEMUKAN PENGHUNI',
    'rep.noDrill': 'Tidak ada latihan aktif', 'rep.noDrillBody': 'Formulir laporan akan muncul saat administrator memulai latihan.',
    'rep.iam': 'SAYA', 'rep.class': 'Kelas / Tim Tanggung Jawab Saya', 'rep.classPh': 'mis. 9A',
    'rep.ap': 'Lokasi Assembly Saya', 'rep.pick': '— pilih —',
    'rep.roster': 'Siswa/Tim Saya yang Masuk Hari Ini (angka)',
    'rep.headcount': 'Jumlah Siswa/Tim yang Bersama Saya (angka)',
    'rep.wali': 'Nama Wali Kelas / Penanggung Jawab Grup',
    'rep.notes': 'Catatan (opsional — cedera, siswa hilang, observasi)',
    'rep.gps': 'Lokasi GPS', 'rep.refresh': 'Perbarui', 'rep.gpsGet': 'Mengambil lokasi…',
    'rep.gpsAcc': 'Akurasi', 'rep.gpsErr': 'Lokasi error',
    'rep.photo': 'Foto (opsional)', 'rep.photoPick': 'Ambil / pilih foto',
    'rep.compress': 'Mengompres…', 'rep.ready': 'Siap',
    'rep.submit': 'Kirim Laporan', 'rep.save': 'Simpan Perubahan',
    'rep.mine': 'Laporan Saya', 'rep.count': '{n} laporan', 'rep.none': 'Belum ada laporan.',
    'rep.edit': 'Ubah', 'rep.people': 'orang', 'rep.present': 'hadir',
    'rep.needClass': 'Kelas / Tim wajib diisi.', 'rep.needAp': 'Pilih Lokasi Assembly.',
    'rep.editing': 'Mengubah laporan {class} · {ap}.',
    'rep.sent': '✓ Laporan terkirim.', 'rep.saved': '✓ Perubahan disimpan.', 'rep.savedToast': 'Laporan tersimpan.',
    'rep.offline': 'Disimpan offline. Akan dikirim otomatis saat online.',
    'dash.stats': 'Statistik Langsung', 'dash.countVsRoster': 'Tercatat vs Roster', 'dash.map': 'Peta Langsung',
    'dash.legendComplete': 'Lengkap', 'dash.legendShort': 'Kurang', 'dash.legendAp': 'Assembly point', 'dash.legendSchool': 'Sekolah',
    'dash.noDrill': 'Tidak ada latihan aktif. Statistik muncul saat latihan dimulai.',
    'dash.updated': 'diperbarui {time}',
    'dash.totalRoster': 'Total Hadir (Roster)', 'dash.counted': 'Tercatat (Evakuasi)',
    'dash.short': 'Kurang', 'dash.over': 'Lebih', 'dash.classesReported': 'Kelas Melapor',
    'dash.classesComplete': 'Kelas Lengkap', 'dash.classesShort': 'Kelas Kurang', 'dash.reports': 'Laporan Masuk',
    'dash.progress': '{pct}% tercatat — {counted}/{roster} siswa, {complete}/{reported} kelas lengkap',
    'mon.title': 'Penghitungan Evakuasi', 'mon.grp': 'GRP', 'mon.wali': 'Wali Kelas',
    'mon.counted': 'Tercatat', 'mon.present': 'Hadir', 'mon.diff': 'Selisih', 'mon.status': 'Status',
    'mon.loading': 'Memuat…', 'mon.none': 'Belum ada laporan.', 'mon.noDrill': 'Belum ada latihan.',
    'mon.banner': 'Tidak ada latihan aktif — menampilkan latihan terakhir bila ada.',
    'exp.title': 'Laporan & Ekspor', 'exp.pick': 'Pilih Latihan', 'exp.comments': 'Catatan Koordinator (disertakan di PDF)',
    'exp.pdf': 'Laporan PDF', 'exp.excel': 'Ekspor Excel', 'exp.excelAll': 'Ekspor Semua Data',
    'exp.perClass': 'Penghitungan per Kelas', 'exp.audit': 'Jejak Audit',
    'common.updated': 'diperbarui', 'common.time': 'Waktu', 'common.user': 'Pengguna', 'common.action': 'Aksi',
  },
};

let lang = localStorage.getItem('sedts.lang') || 'en';
const listeners = new Set();

export function getLang() { return lang; }
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setLang(next) {
  lang = DICT[next] ? next : 'en';
  localStorage.setItem('sedts.lang', lang);
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}

/** Translate a key; interpolate {vars}. Falls back to English, then the key. */
export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}
