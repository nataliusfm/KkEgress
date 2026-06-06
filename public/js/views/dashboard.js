// Dashboard: live evacuation statistics (roster vs counted) + live map.
import { el, escapeHtml } from '../util.js';
import { t } from '../i18n.js';
import { LiveMap } from '../map.js';

export function renderDashboard(root, { state, api, socket }) {
  const drill = state.activeDrill;
  root.appendChild(el(`
    <div>
      <div class="card" id="drill-banner"></div>
      <div class="section-head"><h2>${t('dash.stats')}</h2><span class="muted" id="stat-updated"></span></div>
      <div class="stat-grid" id="stat-grid"></div>
      <div class="card" style="margin-top:1rem">
        <h2>${t('dash.countVsRoster')}</h2>
        <div class="progress"><span id="completion-bar" style="width:0%"></span></div>
        <p class="muted" id="completion-label" style="margin:.5rem 0 0">—</p>
      </div>
      <div class="card">
        <div class="section-head"><h2>${t('dash.map')}</h2></div>
        <div id="map"></div>
        <div class="map-legend">
          <span><i class="legend-dot" style="background:#15803d"></i>${t('dash.legendComplete')}</span>
          <span><i class="legend-dot" style="background:#d8392b"></i>${t('dash.legendShort')}</span>
          <span><i class="legend-dot" style="background:#1f4ea3"></i>${t('dash.legendAp')}</span>
          <span><i class="legend-dot" style="background:#0d1623"></i>${t('dash.legendSchool')}</span>
        </div>
      </div>
    </div>`));

  const banner = root.querySelector('#drill-banner');
  if (drill) {
    banner.innerHTML = `<strong>${escapeHtml(drill.name)}</strong> · ${escapeHtml(drill.typeName || drill.type)}
      · <span class="pill ${drill.status === 'Active' ? 'green' : 'gray'}">${escapeHtml(drill.status)}</span>`;
  } else {
    banner.innerHTML = `<span class="muted">${t('dash.noDrill')}</span>`;
  }

  const grid = root.querySelector('#stat-grid');
  function paintStats(s) {
    const cards = [
      [t('dash.totalRoster'), s.totalRoster, ''],
      [t('dash.counted'), s.totalCounted, 'green'],
      [t('dash.short'), s.missing, s.missing ? 'red' : 'green'],
      [t('dash.over'), s.excess, s.excess ? 'yellow' : ''],
      [t('dash.classesReported'), s.classesReported, ''],
      [t('dash.classesComplete'), s.classesComplete, 'green'],
      [t('dash.classesShort'), s.classesShort, s.classesShort ? 'red' : 'green'],
      [t('dash.reports'), s.reportsCount, ''],
    ];
    grid.innerHTML = cards.map(([lbl, num, cls]) =>
      `<div class="stat ${cls}"><div class="num">${num ?? 0}</div><div class="lbl">${lbl}</div></div>`).join('');
    root.querySelector('#completion-bar').style.width = `${s.accountedPct || 0}%`;
    root.querySelector('#completion-label').textContent = t('dash.progress', {
      pct: s.accountedPct || 0, counted: s.totalCounted, roster: s.totalRoster,
      complete: s.classesComplete, reported: s.classesReported,
    });
    root.querySelector('#stat-updated').textContent = t('dash.updated', { time: new Date().toLocaleTimeString() });
  }

  async function loadStats() {
    try { paintStats(await api.get('/drills/active/stats')); } catch { /* ignore */ }
  }
  loadStats();

  // Map
  const map = new LiveMap(root.querySelector('#map'));
  let mapReady = false;
  let shortClasses = new Set();

  async function refreshShort() {
    if (!drill) return;
    try {
      const rec = await api.get(`/reports/reconcile/${drill.id}`);
      shortClasses = new Set(rec.filter((c) => c.status === 'KURANG').map((c) => c.className));
    } catch { /* ignore */ }
  }

  (async () => {
    mapReady = await map.init(state.config?.schoolLocation || undefined);
    if (!mapReady) return;
    try {
      const [school, points] = await Promise.all([api.get('/admin/school'), api.get('/admin/assembly-points')]);
      map.setSchool(school);
      map.setAssemblyPoints(points);
      await refreshShort();
      const reports = drill ? await api.get(`/reports/drill/${drill.id}`) : [];
      reports.forEach(plotReport);
      map.fitAll();
    } catch { /* ignore */ }
  })();

  function plotReport(r) {
    if (r.lat == null || r.lng == null) return;
    const short = shortClasses.has((r.className || '').toUpperCase());
    map.upsertTeam({
      userId: r.id, name: `${r.className} (${r.headcount})`,
      lat: r.lat, lng: r.lng, status: short ? 'red' : 'green',
      detail: `${r.assemblyPoint} · ${r.headcount} orang · ${r.role === 'PENGHUNI' ? 'Penemu' : 'Wali'}`,
    });
  }

  const onStats = (s) => paintStats(s);
  const onReport = async (r) => { await refreshShort(); if (mapReady && drill && r.drillId === drill.id) plotReport(r); loadStats(); };
  socket?.on('stats:update', onStats);
  socket?.on('report:update', onReport);

  const poll = setInterval(loadStats, 15000);
  return () => { clearInterval(poll); socket?.off('stats:update', onStats); socket?.off('report:update', onReport); map.destroy(); };
}
