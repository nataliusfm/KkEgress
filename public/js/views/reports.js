// Reports & exports: per-drill summary, PDF report, Excel export, audit trail.
import { el, escapeHtml, fmtTime, toast } from '../util.js';
import { t } from '../i18n.js';

export function renderReports(root, { api, state }) {
  root.appendChild(el(`
    <div>
      <div class="card">
        <div class="section-head"><h2>${t('exp.title')}</h2></div>
        <div class="field"><label>${t('exp.pick')}</label><select id="r-drill"></select></div>
        <div id="r-summary"></div>
        <div class="field"><label>${t('exp.comments')}</label>
          <textarea id="r-comments" rows="2"></textarea></div>
        <div class="row-actions">
          <button class="btn btn-primary" id="r-pdf">⬇ ${t('exp.pdf')}</button>
          <button class="btn btn-ghost" id="r-excel">⬇ ${t('exp.excel')}</button>
          <button class="btn btn-ghost" id="r-excel-all">⬇ ${t('exp.excelAll')}</button>
        </div>
      </div>
      <div class="card"><div class="section-head"><h2>${t('exp.perClass')}</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('mon.grp')}</th><th>${t('mon.wali')}</th><th>${t('mon.counted')}</th><th>${t('mon.present')}</th><th>${t('mon.diff')}</th><th>${t('mon.status')}</th></tr></thead>
          <tbody id="r-rows"></tbody></table></div></div>
      <div class="card" data-role="audit"><div class="section-head"><h2>${t('exp.audit')}</h2></div>
        <div class="table-wrap"><table><thead><tr><th>${t('common.time')}</th><th>${t('common.user')}</th><th>${t('common.action')}</th></tr></thead>
          <tbody id="r-audit"></tbody></table></div></div>
    </div>`));

  const drillSel = root.querySelector('#r-drill');

  api.get('/drills').then((drills) => {
    drillSel.innerHTML = drills.map((d) => `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.status)})</option>`).join('')
      || '<option value="">No drills</option>';
    if (state.activeDrill) drillSel.value = state.activeDrill.id;
    loadDrill();
  });

  drillSel.addEventListener('change', loadDrill);

  async function loadDrill() {
    const id = drillSel.value;
    if (!id) return;
    try {
      const [rec, stats] = await Promise.all([
        api.get(`/reports/reconcile/${id}`),
        api.get(`/drills/${id}/stats`),
      ]);
      root.querySelector('#r-summary').innerHTML = `
        <div class="stat-grid" style="margin:.5rem 0">
          <div class="stat green"><div class="num">${stats.totalCounted}</div><div class="lbl">${t('dash.counted')}</div></div>
          <div class="stat ${stats.missing?'red':'green'}"><div class="num">${stats.missing}</div><div class="lbl">${t('dash.short')}</div></div>
          <div class="stat ${stats.classesShort?'red':'green'}"><div class="num">${stats.classesComplete}/${stats.classesReported}</div><div class="lbl">${t('dash.classesComplete')}</div></div>
          <div class="stat"><div class="num">${stats.accountedPct}%</div><div class="lbl">${t('dash.counted')}</div></div>
        </div>`;
      const pill = { LENGKAP: 'green', LEBIH: 'yellow', KURANG: 'red', MENUNGGU: 'gray' };
      root.querySelector('#r-rows').innerHTML = rec.map((c) => `<tr>
        <td><strong>${escapeHtml(c.className)}</strong></td><td>${escapeHtml(c.waliName || '—')}</td>
        <td>${c.counted}</td><td>${c.hasRoster ? c.roster : '—'}</td>
        <td>${c.diff > 0 ? '+' : ''}${c.hasRoster ? c.diff : '—'}</td>
        <td><span class="pill ${pill[c.status] || 'gray'}">${t('st.' + c.status)}</span></td>
      </tr>`).join('') || `<tr><td colspan="6" class="muted">${t('mon.none')}</td></tr>`;
    } catch (e) { toast(e.message, 'error'); }
  }

  root.querySelector('#r-pdf').addEventListener('click', async () => {
    try {
      const blob = await api.blob('POST', `/exports/pdf/${drillSel.value}`, {
        coordinatorComments: root.querySelector('#r-comments').value,
      });
      download(blob, 'drill-report.pdf');
    } catch (e) { toast(e.message, 'error'); }
  });
  root.querySelector('#r-excel').addEventListener('click', () => exportExcel(drillSel.value));
  root.querySelector('#r-excel-all').addEventListener('click', () => exportExcel('all'));

  async function exportExcel(id) {
    try { download(await api.blob('GET', `/exports/excel/${id}`), `drill-${id}.xlsx`); }
    catch (e) { toast(e.message, 'error'); }
  }

  // Audit trail
  api.get('/admin/audit').then((entries) => {
    root.querySelector('#r-audit').innerHTML = entries.slice(0, 100).map((a) => `<tr>
      <td>${fmtTime(a.ts)}</td><td>${escapeHtml(a.userEmail)}</td><td>${escapeHtml(a.action)}</td></tr>`).join('')
      || '<tr><td colspan="3" class="muted">No audit entries.</td></tr>';
  }).catch(() => {});

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
