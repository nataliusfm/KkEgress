// Dashboard: live statistics + embedded live map.
import { el, escapeHtml } from '../util.js';
import { LiveMap } from '../map.js';

export function renderDashboard(root, { state, api, socket }) {
  const drill = state.activeDrill;
  root.appendChild(el(`
    <div>
      <div class="card" id="drill-banner"></div>
      <div class="section-head"><h2>Live Statistics</h2><span class="muted" id="stat-updated"></span></div>
      <div class="stat-grid" id="stat-grid"></div>
      <div class="card" style="margin-top:1rem">
        <h2>Drill Completion</h2>
        <div class="progress"><span id="completion-bar" style="width:0%"></span></div>
        <p class="muted" id="completion-label" style="margin:.5rem 0 0">—</p>
      </div>
      <div class="card">
        <div class="section-head"><h2>Live Map</h2></div>
        <div id="map"></div>
        <div class="map-legend">
          <span><i class="legend-dot" style="background:#1e9e5a"></i>Safe</span>
          <span><i class="legend-dot" style="background:#e0a312"></i>Minor issue</span>
          <span><i class="legend-dot" style="background:#d8392b"></i>Emergency / Missing</span>
          <span><i class="legend-dot" style="background:#2f6fd1"></i>Assembly point</span>
          <span><i class="legend-dot" style="background:#1a3c6e"></i>School</span>
        </div>
      </div>
    </div>`));

  const banner = root.querySelector('#drill-banner');
  if (drill) {
    banner.innerHTML = `<strong>${escapeHtml(drill.name)}</strong> · ${escapeHtml(drill.typeName || drill.type)}
      · <span class="pill ${drill.status === 'Active' ? 'green' : 'gray'}">${escapeHtml(drill.status)}</span>`;
  } else {
    banner.innerHTML = '<span class="muted">No active drill. Statistics will appear when a drill is started.</span>';
  }

  const grid = root.querySelector('#stat-grid');
  function paintStats(s) {
    const cards = [
      ['Total Students', s.totalStudents, ''],
      ['Total Staff', s.totalStaff, ''],
      ['Total Teams', s.totalTeams, ''],
      ['Evacuated', s.evacuated, 'green'],
      ['Not Yet Reported', s.notYetReported, s.notYetReported ? 'yellow' : 'green'],
      ['Safe', s.safe, 'green'],
      ['Injured', s.injured, s.injured ? 'yellow' : ''],
      ['Missing', s.missing, s.missing ? 'red' : 'green'],
    ];
    grid.innerHTML = cards.map(([lbl, num, cls]) =>
      `<div class="stat ${cls}"><div class="num">${num ?? 0}</div><div class="lbl">${lbl}</div></div>`).join('');
    root.querySelector('#completion-bar').style.width = `${s.completionPct || 0}%`;
    root.querySelector('#completion-label').textContent =
      `${s.completionPct || 0}% complete — ${s.teamsReported}/${s.totalTeams} teams reported`;
    root.querySelector('#stat-updated').textContent = `updated ${new Date().toLocaleTimeString()}`;
  }

  async function loadStats() {
    try { paintStats(await api.get('/drills/active/stats')); } catch { /* ignore */ }
  }
  loadStats();

  // Map
  const map = new LiveMap(root.querySelector('#map'));
  let mapReady = false;
  (async () => {
    mapReady = await map.init(state.config?.schoolLocation || undefined);
    if (!mapReady) return;
    try {
      const [school, points, reports] = await Promise.all([
        api.get('/admin/school'),
        api.get('/admin/assembly-points'),
        drill ? api.get(`/reports/drill/${drill.id}`) : [],
      ]);
      map.setSchool(school);
      map.setAssemblyPoints(points);
      (reports || []).forEach(plotReport);
      map.fitAll();
    } catch { /* ignore */ }
  })();

  function plotReport(r) {
    const status = r.condition === 'Serious Injuries' || r.condition === 'Medical Assistance Required' || (r.missing || 0) > 0
      ? 'red' : r.condition === 'Minor Injuries' ? 'yellow' : 'green';
    map.upsertTeam({
      userId: r.teacherId, name: `${r.teamName} (${r.teacherName})`,
      lat: r.lat, lng: r.lng, status,
      detail: `${r.condition} · Present ${r.present}/${r.assigned} · Missing ${r.missing}`,
    });
  }

  // Realtime updates
  const onStats = (s) => paintStats(s);
  const onReport = (r) => { if (mapReady && drill && r.drillId === drill.id) { plotReport(r); } loadStats(); };
  const onGps = (g) => mapReady && map.upsertTeam({ userId: g.userId, name: g.name, lat: g.lat, lng: g.lng, status: 'green', detail: `GPS ±${Math.round(g.accuracy || 0)}m` });
  socket?.on('stats:update', onStats);
  socket?.on('report:update', onReport);
  socket?.on('gps:update', onGps);

  const poll = setInterval(loadStats, 15000);

  return () => {
    clearInterval(poll);
    socket?.off('stats:update', onStats);
    socket?.off('report:update', onReport);
    socket?.off('gps:update', onGps);
    map.destroy();
  };
}
