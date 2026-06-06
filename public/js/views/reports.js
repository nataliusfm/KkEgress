// Reports & exports: per-drill summary, PDF report, Excel export, audit trail.
import { el, escapeHtml, fmtTime, toast, conditionPill } from '../util.js';

export function renderReports(root, { api, state }) {
  root.appendChild(el(`
    <div>
      <div class="card">
        <div class="section-head"><h2>Drill Reports &amp; Exports</h2></div>
        <div class="field"><label>Select Drill</label><select id="r-drill"></select></div>
        <div id="r-summary"></div>
        <div class="field"><label>Coordinator Comments (included in PDF)</label>
          <textarea id="r-comments" rows="2"></textarea></div>
        <div class="row-actions">
          <button class="btn btn-primary" id="r-pdf">⬇ PDF Report</button>
          <button class="btn btn-ghost" id="r-excel">⬇ Excel Export</button>
          <button class="btn btn-ghost" id="r-excel-all">⬇ Export All Data</button>
        </div>
      </div>
      <div class="card"><div class="section-head"><h2>Team Reports</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Team</th><th>Teacher</th><th>Present</th><th>Missing</th><th>Condition</th><th>Submitted</th><th>Photo</th></tr></thead>
          <tbody id="r-rows"></tbody></table></div></div>
      <div class="card" data-role="audit"><div class="section-head"><h2>Audit Trail</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead>
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
      const [reports, stats] = await Promise.all([
        api.get(`/reports/drill/${id}`),
        api.get(`/drills/${id}/stats`),
      ]);
      root.querySelector('#r-summary').innerHTML = `
        <div class="stat-grid" style="margin:.5rem 0">
          <div class="stat green"><div class="num">${stats.evacuated}</div><div class="lbl">Evacuated</div></div>
          <div class="stat ${stats.missing?'red':'green'}"><div class="num">${stats.missing}</div><div class="lbl">Missing</div></div>
          <div class="stat ${stats.injured?'yellow':''}"><div class="num">${stats.injured}</div><div class="lbl">Injured</div></div>
          <div class="stat"><div class="num">${stats.completionPct}%</div><div class="lbl">Complete</div></div>
        </div>`;
      root.querySelector('#r-rows').innerHTML = reports.map((r) => `<tr>
        <td>${escapeHtml(r.teamName)}</td><td>${escapeHtml(r.teacherName)}</td>
        <td>${r.present}/${r.assigned}</td><td>${r.missing}</td>
        <td>${conditionPill(r.condition)}</td><td>${fmtTime(r.submittedAt)}</td>
        <td>${r.photoUrl ? `<a href="${escapeHtml(r.photoUrl)}" target="_blank">view</a>` : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No reports.</td></tr>';
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
