// Coordinator real-time team status list. Auto-refreshes every 15s and on
// realtime report events.
import { el, escapeHtml, fmtTime, conditionPill, reportStatusColor } from '../util.js';

export function renderMonitor(root, { state, api, socket }) {
  const drill = state.activeDrill;
  root.appendChild(el(`
    <div>
      <div class="section-head"><h2>Team Status Monitor</h2><span class="muted" id="mon-updated"></span></div>
      <div id="mon-banner"></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr>
          <th>Status</th><th>Teacher</th><th>Class</th><th>Assembly Point</th>
          <th>Attendance</th><th>Missing</th><th>Condition</th><th>Submitted</th><th>GPS</th>
        </tr></thead>
        <tbody id="mon-body"><tr><td colspan="9" class="muted">Loading…</td></tr></tbody>
      </table></div></div>
    </div>`));

  const body = root.querySelector('#mon-body');
  const banner = root.querySelector('#mon-banner');

  if (!drill) {
    banner.innerHTML = '<div class="banner info">No active drill. Showing the most recent drill if available.</div>';
  }

  async function targetDrillId() {
    if (drill) return drill.id;
    const all = await api.get('/drills');
    return all[0]?.id;
  }

  async function load() {
    try {
      const id = await targetDrillId();
      if (!id) { body.innerHTML = '<tr><td colspan="9" class="muted">No drills yet.</td></tr>'; return; }
      const [reports, users] = await Promise.all([
        api.get(`/reports/drill/${id}`),
        api.get('/admin/users').catch(() => []),
      ]);
      paint(reports, users);
      root.querySelector('#mon-updated').textContent = `updated ${new Date().toLocaleTimeString()}`;
    } catch (e) { body.innerHTML = `<tr><td colspan="9" class="muted">${escapeHtml(e.message)}</td></tr>`; }
  }

  function paint(reports, users) {
    const reported = new Set(reports.map((r) => r.teacherId));
    const teachers = users.filter((u) => u.role === 'TEACHER');
    const rows = [];

    reports.forEach((r) => {
      const color = reportStatusColor(r);
      rows.push(`<tr class="status-${color}">
        <td><span class="pill ${(r.missing||0)>0||r.condition!=='All Safe'?'red':'green'}">Submitted</span></td>
        <td>${escapeHtml(r.teacherName)}</td><td>${escapeHtml(r.teamName)}</td>
        <td>${escapeHtml(r.assemblyPointName || '—')}</td>
        <td>${r.present}/${r.assigned}</td>
        <td>${(r.missing||0)>0 ? `<strong style="color:#d8392b">${r.missing}</strong>` : '0'}</td>
        <td>${conditionPill(r.condition)}</td>
        <td>${fmtTime(r.submittedAt)}</td>
        <td>${r.lat!=null ? `±${Math.round(r.accuracy||0)}m` : '<span class="pill gray">no GPS</span>'}</td>
      </tr>`);
    });

    // Pending teachers (haven't reported yet)
    teachers.filter((t) => !reported.has(t.id)).forEach((t) => {
      rows.push(`<tr class="status-yellow">
        <td><span class="pill yellow">Pending</span></td>
        <td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.teamName || '—')}</td>
        <td>—</td><td>—</td><td>—</td><td><span class="pill gray">—</span></td><td>—</td><td>—</td></tr>`);
    });

    body.innerHTML = rows.join('') || '<tr><td colspan="9" class="muted">No reports yet.</td></tr>';
  }

  load();
  const poll = setInterval(load, 15000);
  const onReport = () => load();
  socket?.on('report:update', onReport);

  return () => { clearInterval(poll); socket?.off('report:update', onReport); };
}
