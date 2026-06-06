// Teacher / team-leader reporting form — mirrors the school's evacuation form.
// Bilingual via i18n; SAYA role: Wali Kelas (roster) or Menemukan Penghuni.
import { el, toast, compressImage, fmtTime, escapeHtml } from '../util.js';
import { t } from '../i18n.js';
import { queueReport } from '../offline.js';

export function renderReport(root, { state, api, socket }) {
  const drill = state.activeDrill;
  const user = state.user;

  if (!drill || drill.status !== 'Active') {
    root.appendChild(el(`<div class="card"><h2>${t('rep.noDrill')}</h2><p class="muted">${t('rep.noDrillBody')}</p></div>`));
    return;
  }

  root.appendChild(el(`
    <div>
      <div id="status-banner"></div>
      <form id="report-form">
        <div class="card">
          <h2>${t('rep.iam')}</h2>
          <div class="field">
            <select id="f-role">
              <option value="WALI_KELAS">${t('role.WALI_FULL')}</option>
              <option value="PENGHUNI">${t('role.PENGHUNI_FULL')}</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="grid-2">
            <div class="field"><label>${t('rep.class')}</label><input id="f-class" list="class-list" placeholder="${t('rep.classPh')}" required></div>
            <div class="field"><label>${t('rep.ap')}</label><select id="f-ap"></select></div>
            <div class="field" id="wrap-roster"><label>${t('rep.roster')}</label><input id="f-roster" type="number" min="0" value="0"></div>
            <div class="field"><label>${t('rep.headcount')}</label><input id="f-headcount" type="number" min="0" value="0" required></div>
            <div class="field" id="wrap-wali"><label>${t('rep.wali')}</label><input id="f-wali"></div>
          </div>
          <div class="field"><label>${t('rep.notes')}</label><textarea id="f-notes" rows="2"></textarea></div>
        </div>

        <div class="card">
          <div class="section-head"><h2>${t('rep.gps')}</h2>
            <button type="button" class="btn btn-sm btn-ghost" id="refresh-gps">↻ ${t('rep.refresh')}</button></div>
          <div class="gps-box" id="gps-box">${t('rep.gpsGet')}</div>
        </div>

        <div class="card">
          <h2>${t('rep.photo')}</h2>
          <div class="photo-drop">
            <input id="f-photo" type="file" accept="image/*" capture="environment" hidden>
            <button type="button" class="btn btn-ghost" id="pick-photo">📷 ${t('rep.photoPick')}</button>
            <div id="photo-meta" class="muted" style="margin-top:.5rem"></div>
            <img id="photo-preview" class="photo-preview hidden" alt="">
          </div>
        </div>

        <div class="card">
          <button type="submit" class="btn btn-primary btn-block" id="submit-btn">${t('rep.submit')}</button>
        </div>
      </form>

      <datalist id="class-list"></datalist>

      <div class="card">
        <div class="section-head"><h2>${t('rep.mine')}</h2><span class="muted" id="mine-count"></span></div>
        <div id="mine-list" class="muted">${t('rep.none')}</div>
      </div>
    </div>`));

  const $ = (s) => root.querySelector(s);
  const roleEl = $('#f-role'), classEl = $('#f-class'), apEl = $('#f-ap');
  const rosterEl = $('#f-roster'), headcountEl = $('#f-headcount'), waliEl = $('#f-wali'), notesEl = $('#f-notes');
  const wrapRoster = $('#wrap-roster'), wrapWali = $('#wrap-wali');
  const banner = $('#status-banner'), submitBtn = $('#submit-btn');

  if (user.teamName) classEl.value = user.teamName;
  waliEl.value = user.name || '';

  function applyRole() {
    const isWali = roleEl.value === 'WALI_KELAS';
    wrapRoster.classList.toggle('hidden', !isWali);
    wrapWali.classList.toggle('hidden', !isWali);
  }
  roleEl.addEventListener('change', applyRole);
  applyRole();

  api.get('/admin/assembly-points').then((points) => {
    apEl.innerHTML = `<option value="">${t('rep.pick')}</option>` +
      points.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('') +
      '<option value="LOCKDOWN">LOCKDOWN</option>';
    if (user.assemblyPointId) {
      const ap = points.find((p) => p.id === user.assemblyPointId);
      if (ap) apEl.value = ap.name;
    }
  });

  // ── GPS ──
  let gps = { lat: null, lng: null, accuracy: null, timestamp: null };
  const gpsBox = $('#gps-box');
  function captureGps() {
    if (!navigator.geolocation) { gpsBox.textContent = 'GPS —'; return; }
    gpsBox.textContent = t('rep.gpsGet');
    navigator.geolocation.getCurrentPosition((pos) => {
      gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: new Date().toISOString() };
      gpsBox.innerHTML = `📍 <strong>${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}</strong><br>${t('rep.gpsAcc')} ±${Math.round(gps.accuracy)} m · ${fmtTime(gps.timestamp)}`;
      socket?.emit('gps:update', { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy });
    }, (err) => { gpsBox.textContent = `${t('rep.gpsErr')}: ${err.message}`; }, { enableHighAccuracy: true, timeout: 10000 });
  }
  $('#refresh-gps').addEventListener('click', captureGps);
  captureGps();
  const gpsInterval = setInterval(captureGps, 30000);

  // ── Photo ──
  let photoBlob = null;
  $('#pick-photo').addEventListener('click', () => $('#f-photo').click());
  $('#f-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#photo-meta').textContent = t('rep.compress');
    photoBlob = await compressImage(file, { maxBytes: 200 * 1024 });
    const img = $('#photo-preview');
    img.src = URL.createObjectURL(photoBlob); img.classList.remove('hidden');
    $('#photo-meta').textContent = `${t('rep.ready')} · ${(photoBlob.size / 1024).toFixed(0)} KB`;
  });

  // ── My submissions ──
  async function loadMine() {
    try {
      const mine = await api.get(`/reports/mine/${drill.id}`);
      $('#mine-count').textContent = t('rep.count', { n: mine.length });
      api.get(`/reports/reconcile/${drill.id}`).then((rec) => {
        $('#class-list').innerHTML = rec.map((c) => `<option value="${escapeHtml(c.className)}">`).join('');
      }).catch(() => {});
      $('#mine-list').innerHTML = mine.length ? mine.map((r) => `
        <div class="list-row">
          <div><strong>${escapeHtml(r.className)}</strong> · ${escapeHtml(r.assemblyPoint)} ·
            <span class="tag">${r.role === 'PENGHUNI' ? t('role.PENGHUNI') : t('role.WALI')}</span>
            ${r.headcount} ${t('rep.people')}${r.role === 'WALI_KELAS' ? ` / ${t('rep.present')} ${r.rosterToday}` : ''}
            <div class="muted">${fmtTime(r.submittedAt)}</div></div>
          <button class="btn btn-sm btn-ghost" data-edit="${r.id}">${t('rep.edit')}</button>
        </div>`).join('') : `<p class="muted">${t('rep.none')}</p>`;
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => startEdit(mine.find((r) => r.id === b.dataset.edit))));
    } catch { /* ignore */ }
  }

  let editingId = null;
  function startEdit(r) {
    if (!r) return;
    editingId = r.id;
    roleEl.value = r.role; applyRole();
    classEl.value = r.className; apEl.value = r.assemblyPoint;
    rosterEl.value = r.rosterToday; headcountEl.value = r.headcount; waliEl.value = r.waliName || '';
    notesEl.value = r.notes || '';
    submitBtn.textContent = t('rep.save');
    banner.innerHTML = `<div class="banner info">${t('rep.editing', { class: escapeHtml(r.className), ap: escapeHtml(r.assemblyPoint) })}</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    editingId = null;
    classEl.value = ''; apEl.selectedIndex = 0; rosterEl.value = 0; headcountEl.value = 0;
    notesEl.value = ''; photoBlob = null;
    $('#photo-preview').classList.add('hidden');
    $('#photo-meta').textContent = '';
    submitBtn.textContent = t('rep.submit');
    applyRole();
  }

  $('#report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!classEl.value.trim()) { toast(t('rep.needClass'), 'warn'); return; }
    if (!apEl.value) { toast(t('rep.needAp'), 'warn'); return; }
    submitBtn.disabled = true;

    const fields = {
      drillId: drill.id, role: roleEl.value, className: classEl.value.trim(), assemblyPoint: apEl.value,
      rosterToday: rosterEl.value, headcount: headcountEl.value, waliName: waliEl.value, notes: notesEl.value,
      lat: gps.lat ?? '', lng: gps.lng ?? '', accuracy: gps.accuracy ?? '', gpsTimestamp: gps.timestamp ?? '',
    };
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    if (photoBlob) form.append('photo', photoBlob, 'team.jpg');

    const method = editingId ? 'PUT' : 'POST';
    const path = editingId ? `/reports/${editingId}` : '/reports';

    if (!navigator.onLine) {
      await queueReport({ method, path, fields, photoBlob });
      banner.innerHTML = `<div class="banner warn">${t('rep.offline')}</div>`;
      resetForm(); submitBtn.disabled = false; loadMine();
      return;
    }
    try {
      if (editingId) await api.putForm(path, form); else await api.postForm(path, form);
      banner.innerHTML = `<div class="banner success">${editingId ? t('rep.saved') : t('rep.sent')}</div>`;
      toast(t('rep.savedToast'), 'success');
      resetForm(); loadMine();
    } catch (err) {
      banner.innerHTML = `<div class="banner warn">${escapeHtml(err.message)}</div>`;
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadMine();
  const onReport = () => loadMine();
  socket?.on('report:update', onReport);
  return () => { clearInterval(gpsInterval); socket?.off('report:update', onReport); };
}
