// Teacher reporting form: GPS capture, attendance, condition, photo (compressed
// to <=200KB), duplicate prevention, edit with revision history, offline queue.
import { el, toast, compressImage, fmtTime, escapeHtml } from '../util.js';
import { queueReport } from '../offline.js';

export function renderReport(root, { state, api, socket }) {
  const drill = state.activeDrill;
  const user = state.user;

  if (!drill || drill.status !== 'Active') {
    root.appendChild(el(`<div class="card"><h2>No active drill</h2>
      <p class="muted">There is no active drill right now. The reporting form will appear when an administrator starts a drill.</p></div>`));
    return;
  }

  root.appendChild(el(`
    <div>
      <div id="status-banner"></div>
      <form id="report-form">
        <div class="card">
          <h2>Teacher Information</h2>
          <div class="grid-2">
            <div class="field"><label>Teacher Name</label><input id="f-teacher" disabled></div>
            <div class="field"><label>Employee ID</label><input id="f-empid"></div>
            <div class="field"><label>Team / Class Name</label><input id="f-team"></div>
            <div class="field"><label>Assembly Point</label><select id="f-assembly"></select></div>
          </div>
        </div>

        <div class="card">
          <div class="section-head"><h2>GPS Location</h2>
            <button type="button" class="btn btn-sm btn-ghost" id="refresh-gps">↻ Refresh</button></div>
          <div class="gps-box" id="gps-box">Acquiring location…</div>
        </div>

        <div class="card">
          <h2>Attendance</h2>
          <div class="grid-3">
            <div class="field"><label>Total Assigned</label><input id="f-assigned" type="number" min="0" value="0"></div>
            <div class="field"><label>Present</label><input id="f-present" type="number" min="0" value="0"></div>
            <div class="field"><label>Missing (auto)</label><input id="f-missing" type="number" disabled value="0"></div>
          </div>
        </div>

        <div class="card">
          <h2>Condition</h2>
          <div class="field"><select id="f-condition">
            <option>All Safe</option><option>Minor Injuries</option>
            <option>Serious Injuries</option><option>Medical Assistance Required</option>
          </select></div>
          <div class="field hidden" id="cond-notes-wrap"><label>Condition Notes</label>
            <textarea id="f-condnotes" rows="2" placeholder="Describe the situation…"></textarea></div>
        </div>

        <div class="card">
          <h2>Student Notes</h2>
          <div class="field"><label>Missing Student Names</label><textarea id="f-missingnames" rows="2"></textarea></div>
          <div class="field"><label>Injured Student Names</label><textarea id="f-injurednames" rows="2"></textarea></div>
          <div class="field"><label>Special Observations</label><textarea id="f-observations" rows="2"></textarea></div>
        </div>

        <div class="card">
          <h2>Team Photo</h2>
          <div class="photo-drop">
            <input id="f-photo" type="file" accept="image/*" capture="environment" hidden>
            <button type="button" class="btn btn-ghost" id="pick-photo">📷 Capture / choose photo</button>
            <div id="photo-meta" class="muted" style="margin-top:.5rem"></div>
            <img id="photo-preview" class="photo-preview hidden" alt="Team photo preview">
          </div>
        </div>

        <div class="card">
          <button type="submit" class="btn btn-primary btn-block" id="submit-btn">Submit Report</button>
        </div>
      </form>
    </div>`));

  // Pre-fill from account
  root.querySelector('#f-teacher').value = user.name;
  root.querySelector('#f-empid').value = user.employeeId || '';
  root.querySelector('#f-team').value = user.teamName || '';
  if (user.assignedStudents) root.querySelector('#f-assigned').value = user.assignedStudents;

  // Assembly points
  const assemblySel = root.querySelector('#f-assembly');
  api.get('/admin/assembly-points').then((points) => {
    assemblySel.innerHTML = '<option value="">— select —</option>' +
      points.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if (user.assemblyPointId) assemblySel.value = user.assemblyPointId;
  });

  // ── Attendance auto-calc ──
  const assignedEl = root.querySelector('#f-assigned');
  const presentEl = root.querySelector('#f-present');
  const missingEl = root.querySelector('#f-missing');
  const recalc = () => {
    const a = Math.max(+assignedEl.value || 0, 0);
    let p = Math.max(+presentEl.value || 0, 0);
    if (p > a) { p = a; presentEl.value = a; }
    missingEl.value = a - p;
  };
  assignedEl.addEventListener('input', recalc);
  presentEl.addEventListener('input', recalc);

  // ── Condition notes toggle ──
  const condEl = root.querySelector('#f-condition');
  const condWrap = root.querySelector('#cond-notes-wrap');
  condEl.addEventListener('change', () => condWrap.classList.toggle('hidden', condEl.value === 'All Safe'));

  // ── GPS ──
  let gps = { lat: null, lng: null, accuracy: null, timestamp: null };
  const gpsBox = root.querySelector('#gps-box');
  function captureGps() {
    if (!navigator.geolocation) { gpsBox.textContent = 'Geolocation not supported on this device.'; return; }
    gpsBox.textContent = 'Acquiring location…';
    navigator.geolocation.getCurrentPosition((pos) => {
      gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: new Date().toISOString() };
      gpsBox.innerHTML = `📍 <strong>${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}</strong><br>
        Accuracy: ±${Math.round(gps.accuracy)} m · ${fmtTime(gps.timestamp)}`;
      socket?.emit('gps:update', { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy });
    }, (err) => { gpsBox.textContent = `Location error: ${err.message}`; }, { enableHighAccuracy: true, timeout: 10000 });
  }
  root.querySelector('#refresh-gps').addEventListener('click', captureGps);
  captureGps();
  const gpsInterval = setInterval(captureGps, 30000); // auto-refresh every 30s

  // ── Photo ──
  let photoBlob = null;
  root.querySelector('#pick-photo').addEventListener('click', () => root.querySelector('#f-photo').click());
  root.querySelector('#f-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const meta = root.querySelector('#photo-meta');
    meta.textContent = 'Compressing…';
    photoBlob = await compressImage(file, { maxBytes: 200 * 1024 });
    const url = URL.createObjectURL(photoBlob);
    const img = root.querySelector('#photo-preview');
    img.src = url; img.classList.remove('hidden');
    meta.textContent = `Ready · ${(photoBlob.size / 1024).toFixed(0)} KB (compressed)`;
  });

  // ── Existing report (edit mode) ──
  let existing = null;
  const banner = root.querySelector('#status-banner');
  const submitBtn = root.querySelector('#submit-btn');

  api.get(`/reports/mine/${drill.id}`).then((rep) => {
    if (!rep) return;
    existing = rep;
    fillForm(rep);
    banner.innerHTML = `<div class="banner success">✓ Already Submitted at ${fmtTime(rep.submittedAt)}.
      ${rep.lastUpdatedAt !== rep.submittedAt ? `Last edited ${fmtTime(rep.lastUpdatedAt)} by ${escapeHtml(rep.editorName || '')}.` : ''}
      You can edit and save changes below.</div>`;
    submitBtn.textContent = 'Save Changes';
  });

  function fillForm(r) {
    root.querySelector('#f-empid').value = r.employeeId || '';
    root.querySelector('#f-team').value = r.teamName || '';
    if (r.assemblyPointId) assemblySel.value = r.assemblyPointId;
    assignedEl.value = r.assigned; presentEl.value = r.present; recalc();
    condEl.value = r.condition; condWrap.classList.toggle('hidden', r.condition === 'All Safe');
    root.querySelector('#f-condnotes').value = r.conditionNotes || '';
    root.querySelector('#f-missingnames').value = r.missingStudents || '';
    root.querySelector('#f-injurednames').value = r.injuredStudents || '';
    root.querySelector('#f-observations').value = r.observations || '';
    if (r.photoUrl) root.querySelector('#photo-meta').innerHTML = `Existing photo on file. <a href="${escapeHtml(r.photoUrl)}" target="_blank">view</a>`;
  }

  // ── Submit / Save ──
  root.querySelector('#report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!existing && !photoBlob) { toast('Please add a team photo before submitting.', 'warn'); return; }
    submitBtn.disabled = true;

    const fields = {
      drillId: drill.id,
      employeeId: root.querySelector('#f-empid').value,
      teamName: root.querySelector('#f-team').value,
      assemblyPointId: assemblySel.value,
      lat: gps.lat ?? '', lng: gps.lng ?? '', accuracy: gps.accuracy ?? '', gpsTimestamp: gps.timestamp ?? '',
      assigned: assignedEl.value, present: presentEl.value,
      condition: condEl.value,
      conditionNotes: root.querySelector('#f-condnotes').value,
      missingStudents: root.querySelector('#f-missingnames').value,
      injuredStudents: root.querySelector('#f-injurednames').value,
      observations: root.querySelector('#f-observations').value,
    };

    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    if (photoBlob) form.append('photo', photoBlob, 'team.jpg');

    const method = existing ? 'PUT' : 'POST';
    const path = existing ? `/reports/${existing.id}` : '/reports';

    if (!navigator.onLine) {
      await queueReport({ method, path, fields, photoBlob });
      submitBtn.disabled = false;
      banner.innerHTML = '<div class="banner warn">Saved offline. Will sync automatically when connection returns.</div>';
      return;
    }

    try {
      const saved = existing ? await api.putForm(path, form) : await api.postForm(path, form);
      existing = saved;
      submitBtn.textContent = 'Save Changes';
      banner.innerHTML = `<div class="banner success">✓ ${method === 'POST' ? 'Submitted' : 'Saved'} successfully.</div>`;
      toast('Report saved.', 'success');
    } catch (err) {
      banner.innerHTML = `<div class="banner warn">${escapeHtml(err.message)}</div>`;
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return () => clearInterval(gpsInterval);
}
