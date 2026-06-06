// Teacher / team-leader reporting form — mirrors the school's evacuation form.
// SAYA: Wali Kelas (knows the roster) or Menemukan Penghuni (found students).
// Multiple submissions are allowed (students scatter across assembly points).
import { el, toast, compressImage, fmtTime, escapeHtml } from '../util.js';
import { queueReport } from '../offline.js';

export function renderReport(root, { state, api, socket }) {
  const drill = state.activeDrill;
  const user = state.user;

  if (!drill || drill.status !== 'Active') {
    root.appendChild(el(`<div class="card"><h2>Tidak ada latihan aktif</h2>
      <p class="muted">Formulir laporan akan muncul saat administrator memulai latihan.</p></div>`));
    return;
  }

  root.appendChild(el(`
    <div>
      <div id="status-banner"></div>
      <form id="report-form">
        <div class="card">
          <h2>SAYA</h2>
          <div class="field">
            <select id="f-role">
              <option value="WALI_KELAS">WALI KELAS ATAU TEAM LEADER</option>
              <option value="PENGHUNI">MENEMUKAN PENGHUNI</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="grid-2">
            <div class="field"><label>Kelas / Tim Tanggung Jawab Saya</label><input id="f-class" list="class-list" placeholder="mis. 9A" required></div>
            <div class="field"><label>Lokasi Assembly Saya</label><select id="f-ap"></select></div>
            <div class="field" id="wrap-roster"><label>Siswa/Tim Saya yang Masuk Hari Ini (angka)</label><input id="f-roster" type="number" min="0" value="0"></div>
            <div class="field"><label>Jumlah Siswa/Tim yang Bersama Saya (angka)</label><input id="f-headcount" type="number" min="0" value="0" required></div>
            <div class="field" id="wrap-wali"><label>Nama Wali Kelas / Penanggung Jawab Grup</label><input id="f-wali"></div>
          </div>
          <div class="field"><label>Catatan (opsional — cedera, siswa hilang, observasi)</label><textarea id="f-notes" rows="2"></textarea></div>
        </div>

        <div class="card">
          <div class="section-head"><h2>Lokasi GPS</h2>
            <button type="button" class="btn btn-sm btn-ghost" id="refresh-gps">↻ Perbarui</button></div>
          <div class="gps-box" id="gps-box">Mengambil lokasi…</div>
        </div>

        <div class="card">
          <h2>Foto (opsional)</h2>
          <div class="photo-drop">
            <input id="f-photo" type="file" accept="image/*" capture="environment" hidden>
            <button type="button" class="btn btn-ghost" id="pick-photo">📷 Ambil / pilih foto</button>
            <div id="photo-meta" class="muted" style="margin-top:.5rem"></div>
            <img id="photo-preview" class="photo-preview hidden" alt="">
          </div>
        </div>

        <div class="card">
          <button type="submit" class="btn btn-primary btn-block" id="submit-btn">Kirim Laporan</button>
        </div>
      </form>

      <datalist id="class-list"></datalist>

      <div class="card">
        <div class="section-head"><h2>Laporan Saya</h2><span class="muted" id="mine-count"></span></div>
        <div id="mine-list" class="muted">Belum ada laporan.</div>
      </div>
    </div>`));

  const roleEl = root.querySelector('#f-role');
  const classEl = root.querySelector('#f-class');
  const apEl = root.querySelector('#f-ap');
  const rosterEl = root.querySelector('#f-roster');
  const headcountEl = root.querySelector('#f-headcount');
  const waliEl = root.querySelector('#f-wali');
  const notesEl = root.querySelector('#f-notes');
  const wrapRoster = root.querySelector('#wrap-roster');
  const wrapWali = root.querySelector('#wrap-wali');
  const banner = root.querySelector('#status-banner');
  const submitBtn = root.querySelector('#submit-btn');

  // Prefill from account
  if (user.teamName) classEl.value = user.teamName;
  waliEl.value = user.name || '';

  // Role toggles roster + wali fields
  function applyRole() {
    const isWali = roleEl.value === 'WALI_KELAS';
    wrapRoster.classList.toggle('hidden', !isWali);
    wrapWali.classList.toggle('hidden', !isWali);
  }
  roleEl.addEventListener('change', applyRole);
  applyRole();

  // Assembly points (configured) + Lockdown
  api.get('/admin/assembly-points').then((points) => {
    apEl.innerHTML = '<option value="">— pilih —</option>' +
      points.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('') +
      '<option value="LOCKDOWN">LOCKDOWN</option>';
    if (user.assemblyPointId) {
      const ap = points.find((p) => p.id === user.assemblyPointId);
      if (ap) apEl.value = ap.name;
    }
  });

  // ── GPS ──
  let gps = { lat: null, lng: null, accuracy: null, timestamp: null };
  const gpsBox = root.querySelector('#gps-box');
  function captureGps() {
    if (!navigator.geolocation) { gpsBox.textContent = 'Geolokasi tidak didukung perangkat ini.'; return; }
    gpsBox.textContent = 'Mengambil lokasi…';
    navigator.geolocation.getCurrentPosition((pos) => {
      gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: new Date().toISOString() };
      gpsBox.innerHTML = `📍 <strong>${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}</strong><br>Akurasi ±${Math.round(gps.accuracy)} m · ${fmtTime(gps.timestamp)}`;
      socket?.emit('gps:update', { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy });
    }, (err) => { gpsBox.textContent = `Lokasi error: ${err.message}`; }, { enableHighAccuracy: true, timeout: 10000 });
  }
  root.querySelector('#refresh-gps').addEventListener('click', captureGps);
  captureGps();
  const gpsInterval = setInterval(captureGps, 30000);

  // ── Photo ──
  let photoBlob = null;
  root.querySelector('#pick-photo').addEventListener('click', () => root.querySelector('#f-photo').click());
  root.querySelector('#f-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    root.querySelector('#photo-meta').textContent = 'Mengompres…';
    photoBlob = await compressImage(file, { maxBytes: 200 * 1024 });
    const img = root.querySelector('#photo-preview');
    img.src = URL.createObjectURL(photoBlob); img.classList.remove('hidden');
    root.querySelector('#photo-meta').textContent = `Siap · ${(photoBlob.size / 1024).toFixed(0)} KB`;
  });

  // ── My submissions list ──
  async function loadMine() {
    try {
      const mine = await api.get(`/reports/mine/${drill.id}`);
      const classes = [...new Set(mine.map((r) => r.className))];
      root.querySelector('#mine-count').textContent = `${mine.length} laporan`;
      // class datalist for quick entry
      api.get(`/reports/reconcile/${drill.id}`).then((rec) => {
        root.querySelector('#class-list').innerHTML = rec.map((c) => `<option value="${escapeHtml(c.className)}">`).join('');
      }).catch(() => {});
      root.querySelector('#mine-list').innerHTML = mine.length ? mine.map((r) => `
        <div class="list-row">
          <div><strong>${escapeHtml(r.className)}</strong> · ${escapeHtml(r.assemblyPoint)} ·
            <span class="tag">${r.role === 'PENGHUNI' ? 'Penemu' : 'Wali'}</span>
            ${r.headcount} orang${r.role === 'WALI_KELAS' ? ` / hadir ${r.rosterToday}` : ''}
            <div class="muted">${fmtTime(r.submittedAt)}</div></div>
          <button class="btn btn-sm btn-ghost" data-edit="${r.id}">Ubah</button>
        </div>`).join('') : '<p class="muted">Belum ada laporan.</p>';
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
    submitBtn.textContent = 'Simpan Perubahan';
    banner.innerHTML = `<div class="banner info">Mengubah laporan ${escapeHtml(r.className)} · ${escapeHtml(r.assemblyPoint)}.</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm(keepRole = true) {
    editingId = null;
    if (!keepRole) roleEl.value = 'WALI_KELAS';
    classEl.value = ''; apEl.selectedIndex = 0; rosterEl.value = 0; headcountEl.value = 0;
    notesEl.value = ''; photoBlob = null;
    root.querySelector('#photo-preview').classList.add('hidden');
    root.querySelector('#photo-meta').textContent = '';
    submitBtn.textContent = 'Kirim Laporan';
    applyRole();
  }

  // ── Submit ──
  root.querySelector('#report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!classEl.value.trim()) { toast('Kelas / Tim wajib diisi.', 'warn'); return; }
    if (!apEl.value) { toast('Pilih Lokasi Assembly.', 'warn'); return; }
    submitBtn.disabled = true;

    const fields = {
      drillId: drill.id,
      role: roleEl.value,
      className: classEl.value.trim(),
      assemblyPoint: apEl.value,
      rosterToday: rosterEl.value,
      headcount: headcountEl.value,
      waliName: waliEl.value,
      notes: notesEl.value,
      lat: gps.lat ?? '', lng: gps.lng ?? '', accuracy: gps.accuracy ?? '', gpsTimestamp: gps.timestamp ?? '',
    };
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    if (photoBlob) form.append('photo', photoBlob, 'team.jpg');

    const method = editingId ? 'PUT' : 'POST';
    const path = editingId ? `/reports/${editingId}` : '/reports';

    if (!navigator.onLine) {
      await queueReport({ method, path, fields, photoBlob });
      banner.innerHTML = '<div class="banner warn">Disimpan offline. Akan dikirim otomatis saat online.</div>';
      resetForm(); submitBtn.disabled = false; loadMine();
      return;
    }
    try {
      if (editingId) await api.putForm(path, form); else await api.postForm(path, form);
      banner.innerHTML = `<div class="banner success">✓ ${editingId ? 'Perubahan disimpan' : 'Laporan terkirim'}.</div>`;
      toast('Laporan tersimpan.', 'success');
      resetForm();
      loadMine();
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
