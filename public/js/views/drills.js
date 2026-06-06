// Super-admin drill management: create drills, start/complete, list.
import { el, escapeHtml, fmtTime, toast } from '../util.js';

export function renderDrills(root, { api, navigate }) {
  root.appendChild(el(`
    <div>
      <div class="card">
        <h2>Start a New Drill</h2>
        <form id="drill-form">
          <div class="grid-2">
            <div class="field"><label>Drill Name</label><input id="d-name" required placeholder="e.g. Term 2 Fire Drill"></div>
            <div class="field"><label>Drill Type</label><select id="d-type"></select></div>
            <div class="field"><label>Date</label><input id="d-date" type="date" required></div>
            <div class="field"><label>Start Time</label><input id="d-time" type="time"></div>
            <div class="field"><label>Coordinator</label><select id="d-coord"></select></div>
          </div>
          <div class="field"><label>Notes</label><textarea id="d-notes" rows="2"></textarea></div>
          <button class="btn btn-primary" type="submit">Create Drill (Planned)</button>
        </form>
      </div>
      <div class="card">
        <div class="section-head"><h2>Drills</h2></div>
        <div id="drill-list" class="muted">Loading…</div>
      </div>
    </div>`));

  const typeSel = root.querySelector('#d-type');
  const coordSel = root.querySelector('#d-coord');
  root.querySelector('#d-date').valueAsDate = new Date();

  Promise.all([api.get('/admin/drill-types'), api.get('/admin/users')]).then(([types, users]) => {
    typeSel.innerHTML = types.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    const coords = users.filter((u) => u.role === 'COORDINATOR' || u.role === 'SUPER_ADMIN');
    coordSel.innerHTML = '<option value="">— none —</option>' +
      coords.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  });

  root.querySelector('#drill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/drills', {
        name: root.querySelector('#d-name').value,
        type: typeSel.value,
        date: root.querySelector('#d-date').value,
        startTime: root.querySelector('#d-time').value,
        coordinatorId: coordSel.value,
        notes: root.querySelector('#d-notes').value,
      });
      toast('Drill created.', 'success');
      e.target.reset();
      root.querySelector('#d-date').valueAsDate = new Date();
      loadList();
    } catch (err) { toast(err.message, 'error'); }
  });

  async function loadList() {
    const list = root.querySelector('#drill-list');
    try {
      const drills = await api.get('/drills');
      if (!drills.length) { list.innerHTML = '<p class="muted">No drills yet.</p>'; return; }
      list.innerHTML = drills.map((d) => {
        const pill = d.status === 'Active' ? 'green' : d.status === 'Completed' ? 'gray' : 'yellow';
        const actions = d.status === 'Planned'
          ? `<button class="btn btn-sm btn-success" data-act="Active" data-id="${d.id}">▶ Start</button>`
          : d.status === 'Active'
            ? `<button class="btn btn-sm btn-danger" data-act="Completed" data-id="${d.id}">⏹ Complete</button>`
            : '';
        return `<div class="list-row">
          <div><strong>${escapeHtml(d.name)}</strong> <span class="tag">${escapeHtml(d.typeName || d.type)}</span>
            <span class="pill ${pill}">${escapeHtml(d.status)}</span>
            <div class="muted">${escapeHtml(d.date)} ${escapeHtml(d.startTime || '')} · created ${fmtTime(d.createdAt)}</div></div>
          <div class="row-actions">${actions}</div>
        </div>`;
      }).join('');

      list.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
        try {
          await api.post(`/drills/${btn.dataset.id}/status`, { status: btn.dataset.act });
          toast(`Drill ${btn.dataset.act === 'Active' ? 'started' : 'completed'}.`, 'success');
          loadList();
          if (btn.dataset.act === 'Active') setTimeout(() => navigate('monitor'), 600);
        } catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { list.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`; }
  }
  loadList();
}
