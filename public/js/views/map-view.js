// Full live map view with team tracking and (for teachers) GPS sharing.
import { el } from '../util.js';
import { LiveMap } from '../map.js';

export function renderMap(root, { state, api, socket }) {
  const drill = state.activeDrill;
  const isTeacher = state.user.role === 'TEACHER';

  root.appendChild(el(`
    <div>
      <div class="section-head">
        <h2>Live Map</h2>
        <div>
          ${isTeacher ? '<button class="btn btn-sm btn-success" id="share-gps">📍 Share my location</button>' : ''}
          <button class="btn btn-sm btn-ghost" id="fit-all">Fit all</button>
        </div>
      </div>
      <div class="card"><div id="map" style="height:70vh"></div>
        <div class="map-legend">
          <span><i class="legend-dot" style="background:#1e9e5a"></i>Safe</span>
          <span><i class="legend-dot" style="background:#e0a312"></i>Minor</span>
          <span><i class="legend-dot" style="background:#d8392b"></i>Emergency</span>
          <span><i class="legend-dot" style="background:#2f6fd1"></i>Assembly</span>
          <span><i class="legend-dot" style="background:#1a3c6e"></i>School</span>
        </div>
      </div>
    </div>`));

  const map = new LiveMap(root.querySelector('#map'));
  let ready = false;
  (async () => {
    ready = await map.init();
    if (!ready) return;
    const [school, points, reports] = await Promise.all([
      api.get('/admin/school'),
      api.get('/admin/assembly-points'),
      drill ? api.get(`/reports/drill/${drill.id}`) : [],
    ]);
    map.setSchool(school);
    map.setAssemblyPoints(points);
    (reports || []).forEach(plot);
    map.fitAll();
  })();

  function plot(r) {
    if (r.lat == null || r.lng == null) return;
    map.upsertTeam({ userId: r.id, name: `${r.className} (${r.headcount})`, lat: r.lat, lng: r.lng, status: 'green',
      detail: `${r.assemblyPoint} · ${r.headcount} orang · ${r.role === 'PENGHUNI' ? 'Penemu' : 'Wali'}` });
  }

  const onReport = (r) => ready && plot(r);
  const onGps = (g) => ready && map.upsertTeam({ userId: g.userId, name: g.name, lat: g.lat, lng: g.lng, status: 'green', detail: `GPS ±${Math.round(g.accuracy || 0)}m` });
  socket?.on('report:update', onReport);
  socket?.on('gps:update', onGps);

  root.querySelector('#fit-all')?.addEventListener('click', () => map.fitAll());

  // Teacher GPS sharing every 30s while drill active
  let watchId = null;
  root.querySelector('#share-gps')?.addEventListener('click', (e) => {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      e.target.textContent = '📍 Share my location'; e.target.classList.replace('btn-ghost', 'btn-success');
      return;
    }
    watchId = navigator.geolocation.watchPosition((pos) => {
      socket?.emit('gps:update', { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      if (ready) { map.upsertTeam({ userId: state.user.id, name: 'You', lat: pos.coords.latitude, lng: pos.coords.longitude, status: 'green', detail: 'Your location' }); }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
    e.target.textContent = '⏹ Stop sharing'; e.target.classList.replace('btn-success', 'btn-ghost');
  });

  return () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    socket?.off('report:update', onReport);
    socket?.off('gps:update', onGps);
    map.destroy();
  };
}
