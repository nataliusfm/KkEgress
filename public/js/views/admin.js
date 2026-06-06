// Super-admin administration: school settings, users, assembly points,
// drill types, and Google integration status.
import { el, escapeHtml, toast, compressImage } from '../util.js';

export function renderAdmin(root, { api }) {
  root.appendChild(el(`
    <div>
      <div class="card">
        <h2>School Settings</h2>
        <div class="logo-row">
          <div class="logo-preview" id="s-logo-preview">🏫</div>
          <div>
            <label>School Logo / Crest</label>
            <input id="s-logo-file" type="file" accept="image/*" hidden>
            <button type="button" class="btn btn-ghost btn-sm" id="s-logo-pick">Upload logo</button>
            <button type="button" class="btn btn-ghost btn-sm" id="s-logo-clear">Remove</button>
            <p class="muted" id="s-logo-meta" style="margin:.4rem 0 0">Shown on the sidebar and login screen.</p>
          </div>
        </div>
        <div class="grid-2" style="margin-top:1rem">
          <div class="field"><label>School Name</label><input id="s-name"></div>
          <div class="field"><label>Address</label><input id="s-address"></div>
          <div class="field"><label>Latitude</label><input id="s-lat" type="number" step="any"></div>
          <div class="field"><label>Longitude</label><input id="s-lng" type="number" step="any"></div>
        </div>
        <button class="btn btn-primary" id="s-save">Save Settings</button>
      </div>

      <div class="card">
        <h2>Google Integration Status</h2>
        <div id="g-status" class="muted">Checking…</div>
      </div>

      <div class="card">
        <h2>Users</h2>
        <form id="u-form" class="grid-3">
          <div class="field"><label>Email</label><input id="u-email" type="email"></div>
          <div class="field"><label>Name</label><input id="u-name"></div>
          <div class="field"><label>Role</label><select id="u-role">
            <option value="TEACHER">Teacher / Team Leader</option>
            <option value="COORDINATOR">Emergency Coordinator</option>
            <option value="SUPER_ADMIN">Super Administrator</option></select></div>
          <div class="field"><label>Employee ID</label><input id="u-empid"></div>
          <div class="field"><label>Team / Class</label><input id="u-team"></div>
          <div class="field"><label>Assigned Students</label><input id="u-students" type="number" min="0" value="0"></div>
          <div class="field"><label>Password</label><input id="u-password" type="password" placeholder="Set login password"></div>
          <div class="field" style="align-self:end"><button class="btn btn-primary" type="submit">Add User</button></div>
        </form>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Password</th><th></th></tr></thead>
          <tbody id="u-rows"></tbody></table></div>
      </div>

      <div class="card">
        <h2>Evacuation Assembly Points</h2>
        <form id="ap-form" class="grid-3">
          <div class="field"><label>Name</label><input id="ap-name"></div>
          <div class="field"><label>Latitude</label><input id="ap-lat" type="number" step="any"></div>
          <div class="field"><label>Longitude</label><input id="ap-lng" type="number" step="any"></div>
          <div class="field" style="align-self:end"><button class="btn btn-primary" type="submit">Add Point</button></div>
        </form>
        <div id="ap-list" class="muted">Loading…</div>
      </div>

      <div class="card">
        <h2>Drill Types</h2>
        <form id="dt-form" style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap">
          <div class="field" style="flex:1;margin:0"><label>Custom Type Name</label><input id="dt-name"></div>
          <button class="btn btn-primary" type="submit">Add Type</button>
        </form>
        <div id="dt-list" class="muted" style="margin-top:1rem">Loading…</div>
      </div>
    </div>`));

  // ── School ──
  let logoUrl = '';
  const logoPreview = root.querySelector('#s-logo-preview');
  const setPreview = (url) => {
    logoUrl = url || '';
    logoPreview.innerHTML = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="">` : '🏫';
  };

  api.get('/admin/school').then((s) => {
    root.querySelector('#s-name').value = s.name || '';
    root.querySelector('#s-address').value = s.address || '';
    root.querySelector('#s-lat').value = s.location?.lat ?? '';
    root.querySelector('#s-lng').value = s.location?.lng ?? '';
    setPreview(s.logoUrl || '');
  });

  // Logo upload: compress to a small JPEG/PNG data URL stored in settings.
  root.querySelector('#s-logo-pick').addEventListener('click', () => root.querySelector('#s-logo-file').click());
  root.querySelector('#s-logo-clear').addEventListener('click', () => { setPreview(''); root.querySelector('#s-logo-meta').textContent = 'Logo will be removed on save.'; });
  root.querySelector('#s-logo-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    root.querySelector('#s-logo-meta').textContent = 'Processing…';
    const blob = await compressImage(file, { maxBytes: 120 * 1024, maxDim: 320, mime: 'image/png' });
    const reader = new FileReader();
    reader.onload = () => { setPreview(reader.result); root.querySelector('#s-logo-meta').textContent = `Ready · ${(blob.size / 1024).toFixed(0)} KB. Click Save Settings.`; };
    reader.readAsDataURL(blob);
  });

  root.querySelector('#s-save').addEventListener('click', async () => {
    try {
      await api.put('/admin/school', {
        name: root.querySelector('#s-name').value,
        address: root.querySelector('#s-address').value,
        location: { lat: +root.querySelector('#s-lat').value, lng: +root.querySelector('#s-lng').value },
        logoUrl,
      });
      toast('School settings saved. Reload to see the logo everywhere.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  // ── Google status ──
  api.get('/admin/google-status').then((g) => {
    const dot = (ok) => `<span class="pill ${ok ? 'green' : 'gray'}">${ok ? 'connected' : 'not configured'}</span>`;
    root.querySelector('#g-status').innerHTML = `
      <div class="list-row"><span>Google Sign-In</span>${dot(g.signIn)}</div>
      <div class="list-row"><span>Google Maps</span>${dot(g.maps)}</div>
      <div class="list-row"><span>Google Sheets</span>${dot(g.sheets)}</div>
      <div class="list-row"><span>Google Drive</span>${dot(g.drive)}</div>
      <div class="list-row"><span>Google Photos</span>${dot(g.photos)}</div>
      <p class="muted">Configure credentials in <code>.env</code> to enable each integration.</p>`;
  }).catch(() => {});

  // ── Users ──
  async function loadUsers() {
    const users = await api.get('/admin/users');
    root.querySelector('#u-rows').innerHTML = users.map((u) => `<tr>
      <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
      <td><span class="tag">${escapeHtml(u.role)}</span></td><td>${escapeHtml(u.teamName || '—')}</td>
      <td><span class="pill ${u.hasPassword ? 'green' : 'gray'}">${u.hasPassword ? 'Set' : 'Not set'}</span></td>
      <td style="display:flex;gap:.3rem">
        <button class="btn btn-sm btn-ghost" data-edit="${u.id}" data-name="${escapeHtml(u.name)}">✏️</button>
        <button class="btn btn-sm btn-ghost" data-setpw="${u.id}" title="Set password">🔑</button>
        <button class="btn btn-sm btn-danger" data-del="${u.id}">✕</button>
      </td></tr>`).join('');
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
      const newName = prompt('Edit name:', b.dataset.name);
      if (!newName || newName === b.dataset.name) return;
      try { await api.put(`/admin/users/${b.dataset.edit}`, { name: newName }); loadUsers(); toast('Name updated.', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    root.querySelectorAll('[data-setpw]').forEach((b) => b.addEventListener('click', async () => {
      const pw = prompt('Set password for this user (min 6 characters):');
      if (!pw) return;
      try { await api.post(`/admin/users/${b.dataset.setpw}/set-password`, { password: pw }); loadUsers(); toast('Password set.', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      try { await api.del(`/admin/users/${b.dataset.del}`); loadUsers(); } catch (e) { toast(e.message, 'error'); }
    }));
  }
  loadUsers();
  root.querySelector('#u-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', {
        email: root.querySelector('#u-email').value,
        name: root.querySelector('#u-name').value,
        role: root.querySelector('#u-role').value,
        employeeId: root.querySelector('#u-empid').value,
        teamName: root.querySelector('#u-team').value,
        assignedStudents: root.querySelector('#u-students').value,
        password: root.querySelector('#u-password').value,
      });
      toast('User added.', 'success');
      e.target.reset(); loadUsers();
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Assembly points ──
  async function loadAP() {
    const points = await api.get('/admin/assembly-points');
    const list = root.querySelector('#ap-list');
    list.innerHTML = points.map((p) => `<div class="list-row">
      <div><strong>${escapeHtml(p.name)}</strong> <span class="muted">${p.location?.lat}, ${p.location?.lng}</span></div>
      <button class="btn btn-sm btn-danger" data-apdel="${p.id}">✕</button></div>`).join('')
      || '<p class="muted">No assembly points yet.</p>';
    list.querySelectorAll('[data-apdel]').forEach((b) => b.addEventListener('click', async () => {
      await api.del(`/admin/assembly-points/${b.dataset.apdel}`); loadAP();
    }));
  }
  loadAP();
  root.querySelector('#ap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/assembly-points', {
        name: root.querySelector('#ap-name').value,
        location: { lat: +root.querySelector('#ap-lat').value, lng: +root.querySelector('#ap-lng').value },
      });
      toast('Assembly point added.', 'success'); e.target.reset(); loadAP();
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Drill types ──
  async function loadDT() {
    const types = await api.get('/admin/drill-types');
    const list = root.querySelector('#dt-list');
    list.innerHTML = types.map((t) => `<div class="list-row">
      <div>${escapeHtml(t.name)} ${t.builtin ? '<span class="tag">built-in</span>' : ''}</div>
      ${t.builtin ? '' : `<button class="btn btn-sm btn-danger" data-dtdel="${t.id}">✕</button>`}</div>`).join('');
    list.querySelectorAll('[data-dtdel]').forEach((b) => b.addEventListener('click', async () => {
      await api.del(`/admin/drill-types/${b.dataset.dtdel}`); loadDT();
    }));
  }
  loadDT();
  root.querySelector('#dt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/drill-types', { name: root.querySelector('#dt-name').value });
      toast('Drill type added.', 'success'); e.target.reset(); loadDT();
    } catch (err) { toast(err.message, 'error'); }
  });
}
