// Coordinator real-time monitor: per-class reconciliation (LENGKAP/KURANG/LEBIH),
// summing headcounts across assembly points vs each class roster.
import { el, escapeHtml } from '../util.js';

const STATUS_PILL = {
  LENGKAP: 'green', LEBIH: 'yellow', KURANG: 'red', MENUNGGU: 'gray',
};

export function renderMonitor(root, { state, api, socket }) {
  const drill = state.activeDrill;
  root.appendChild(el(`
    <div>
      <div class="section-head"><h2>Penghitungan Evakuasi</h2><span class="muted" id="mon-updated"></span></div>
      <div id="mon-banner"></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr id="mon-head">
          <th>GRP</th><th>Wali Kelas</th><th>Tercatat</th><th>Hadir</th><th>Selisih</th><th>Status</th>
        </tr></thead>
        <tbody id="mon-body"><tr><td colspan="6" class="muted">Memuat…</td></tr></tbody>
      </table></div></div>
    </div>`));

  const body = root.querySelector('#mon-body');
  const head = root.querySelector('#mon-head');
  const banner = root.querySelector('#mon-banner');
  let apNames = [];

  if (!drill) banner.innerHTML = '<div class="banner info">Tidak ada latihan aktif — menampilkan latihan terakhir bila ada.</div>';

  async function targetDrillId() {
    if (drill) return drill.id;
    const all = await api.get('/drills');
    return all[0]?.id;
  }

  // Build dynamic AP columns once.
  api.get('/admin/assembly-points').then((points) => {
    apNames = [...points.map((p) => p.name), 'LOCKDOWN'];
    head.innerHTML = '<th>GRP</th><th>Wali Kelas</th>' +
      apNames.map((n) => `<th>${escapeHtml(n.replace('Assembly Point', 'AP'))}</th>`).join('') +
      '<th>Tercatat</th><th>Hadir</th><th>Selisih</th><th>Status</th>';
    load();
  });

  async function load() {
    try {
      const id = await targetDrillId();
      if (!id) { body.innerHTML = '<tr><td colspan="6" class="muted">Belum ada latihan.</td></tr>'; return; }
      const rec = await api.get(`/reports/reconcile/${id}`);
      paint(rec);
      root.querySelector('#mon-updated').textContent = `diperbarui ${new Date().toLocaleTimeString()}`;
    } catch (e) { body.innerHTML = `<tr><td colspan="6" class="muted">${escapeHtml(e.message)}</td></tr>`; }
  }

  function paint(rec) {
    if (!rec.length) { body.innerHTML = `<tr><td colspan="${apNames.length + 6}" class="muted">Belum ada laporan.</td></tr>`; return; }
    body.innerHTML = rec.map((c) => {
      const color = STATUS_PILL[c.status] || 'gray';
      const apCells = apNames.map((n) => `<td>${c.byAP[n] || ''}</td>`).join('');
      return `<tr class="status-${color === 'gray' ? 'yellow' : color}">
        <td><strong>${escapeHtml(c.className)}</strong></td>
        <td>${escapeHtml(c.waliName || '—')}</td>
        ${apCells}
        <td><strong>${c.counted}</strong></td>
        <td>${c.hasRoster ? c.roster : '—'}</td>
        <td>${c.diff > 0 ? '+' : ''}${c.hasRoster ? c.diff : '—'}</td>
        <td><span class="pill ${color}">${c.status}</span></td>
      </tr>`;
    }).join('');
  }

  const onReport = () => load();
  socket?.on('report:update', onReport);
  const poll = setInterval(load, 15000);
  return () => { clearInterval(poll); socket?.off('report:update', onReport); };
}
