import { api, auth } from './api.js';
import { toast, timeAgo, escapeHtml } from './util.js';
import { configureMaps } from './map.js';
import { syncPending, pendingCount } from './offline.js';

import { renderDashboard } from './views/dashboard.js';
import { renderMap } from './views/map-view.js';
import { renderReport } from './views/report.js';
import { renderMonitor } from './views/monitor.js';
import { renderDrills } from './views/drills.js';
import { renderReports } from './views/reports.js';
import { renderAdmin } from './views/admin.js';

// ───────── Shared app state ─────────
export const state = {
  config: {},
  user: null,
  socket: null,
  activeDrill: null,
  notifications: [],
};

const ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  map: { title: 'Live Map', render: renderMap },
  report: { title: 'My Report', render: renderReport, roles: ['TEACHER'] },
  monitor: { title: 'Team Monitor', render: renderMonitor, roles: ['COORDINATOR', 'SUPER_ADMIN'] },
  drills: { title: 'Drills', render: renderDrills, roles: ['SUPER_ADMIN'] },
  reports: { title: 'Reports', render: renderReports, roles: ['COORDINATOR', 'SUPER_ADMIN'] },
  admin: { title: 'Administration', render: renderAdmin, roles: ['SUPER_ADMIN'] },
};

let currentCleanup = null;

// ───────── Boot ─────────
init();

async function init() {
  try {
    state.config = await api.get('/auth/config');
  } catch {
    state.config = {};
  }
  configureMaps(state.config.mapsApiKey || '');
  document.getElementById('login-school-name').textContent =
    state.config.schoolName || 'School Emergency Drill';

  setupLogin();
  setupChrome();
  bindConnectivity();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (auth.token) {
    try {
      const { user } = await api.get('/auth/me');
      onAuthenticated(user);
      return;
    } catch { /* fall through to login */ }
  }
  showLogin();
}

// ───────── Authentication ─────────
function setupLogin() {
  const errEl = document.getElementById('login-error');

  // Password login form (always visible)
  document.getElementById('pw-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const email = document.getElementById('pw-email').value.trim();
    const password = document.getElementById('pw-password').value;
    try {
      const { token, user } = await api.post('/auth/login', { email, password });
      auth.token = token;
      onAuthenticated(user);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  // Google Identity Services
  if (state.config.googleClientId && window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: state.config.googleClientId,
      callback: async ({ credential }) => {
        try {
          const { token, user } = await api.post('/auth/google', { credential });
          auth.token = token;
          onAuthenticated(user);
        } catch (e) { errEl.textContent = e.message; }
      },
    });
    google.accounts.id.renderButton(document.getElementById('google-signin'),
      { theme: 'filled_blue', size: 'large', width: 280 });
    document.getElementById('login-divider').classList.remove('hidden');
  } else if (state.config.googleClientId) {
    // GIS script may still be loading; retry shortly.
    setTimeout(setupLogin, 400);
  }

  // Dev login
  if (state.config.allowDevLogin) {
    document.getElementById('dev-login').classList.remove('hidden');
    document.getElementById('dev-login-btn').addEventListener('click', async () => {
      try {
        const email = document.getElementById('dev-email').value.trim();
        const name = document.getElementById('dev-name').value.trim();
        const { token, user } = await api.post('/auth/dev', { email, name });
        auth.token = token;
        onAuthenticated(user);
      } catch (e) { errEl.textContent = e.message; }
    });
  }
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

async function onAuthenticated(user) {
  state.user = user; auth.user = user;
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  // User chip
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-role').textContent = roleLabel(user.role);
  const avatar = document.getElementById('user-avatar');
  if (user.picture) avatar.src = user.picture; else avatar.style.display = 'none';

  applyRoleVisibility();
  connectSocket();
  await loadActiveDrill();
  await loadNotifications();
  syncPending();

  navigate(defaultRoute());
}

window.addEventListener('auth:expired', () => {
  toast('Session expired. Please sign in again.', 'error');
  logout();
});

function logout() {
  auth.token = null; state.user = null;
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  showLogin();
}

function roleLabel(r) {
  return { SUPER_ADMIN: 'Super Administrator', COORDINATOR: 'Emergency Coordinator', TEACHER: 'Teacher / Team Leader' }[r] || r;
}

function defaultRoute() {
  return state.user.role === 'TEACHER' ? 'report' : 'dashboard';
}

function applyRoleVisibility() {
  document.querySelectorAll('[data-role]').forEach((node) => {
    const roles = node.dataset.role.split(',');
    node.classList.toggle('hidden', !roles.includes(state.user.role));
  });
}

// ───────── App chrome (nav, notifications) ─────────
function setupChrome() {
  const sidenav = document.getElementById('sidenav');
  const scrim = document.getElementById('scrim');
  const closeNav = () => { sidenav.classList.remove('open'); scrim.classList.remove('show'); };

  document.getElementById('nav-toggle').addEventListener('click', () => {
    sidenav.classList.toggle('open'); scrim.classList.toggle('show');
  });
  scrim.addEventListener('click', closeNav);

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => { navigate(item.dataset.route); closeNav(); });
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  const drawer = document.getElementById('notif-drawer');
  document.getElementById('notif-btn').addEventListener('click', () => drawer.classList.toggle('hidden'));
  document.getElementById('notif-close').addEventListener('click', () => drawer.classList.add('hidden'));
}

function bindConnectivity() {
  const dot = document.getElementById('connection-dot');
  const update = () => {
    if (!navigator.onLine) { dot.className = 'conn-dot offline'; dot.title = 'Offline'; }
  };
  window.addEventListener('offline', update);
  window.addEventListener('online', () => { dot.className = 'conn-dot'; });
  update();
}

// ───────── Routing ─────────
export function navigate(route) {
  const def = ROUTES[route];
  if (!def) return;
  if (def.roles && !def.roles.includes(state.user.role)) return navigate(defaultRoute());

  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
  document.getElementById('topbar-title').textContent = def.title;

  if (typeof currentCleanup === 'function') { currentCleanup(); currentCleanup = null; }
  const content = document.getElementById('content');
  content.innerHTML = '';
  currentCleanup = def.render(content, ctx()) || null;
}

/** Context passed to every view. */
export function ctx() {
  return { state, api, socket: state.socket, navigate, toast, reloadDrill: loadActiveDrill };
}

// ───────── Realtime ─────────
function connectSocket() {
  const dot = document.getElementById('connection-dot');
  const socket = io({ auth: { token: auth.token } });
  state.socket = socket;

  socket.on('connect', () => { dot.className = 'conn-dot online'; });
  socket.on('disconnect', () => { dot.className = 'conn-dot offline'; });

  socket.on('notification', (n) => {
    state.notifications.unshift(n);
    renderNotifications();
    if (n.severity === 'critical') toast(n.message, 'error');
    else if (n.severity === 'warning') toast(n.message, 'warn');
  });

  socket.on('drill:update', (drill) => {
    loadActiveDrill().then(() => window.dispatchEvent(new CustomEvent('drill:changed', { detail: drill })));
  });
}

async function loadActiveDrill() {
  try { state.activeDrill = await api.get('/drills/active'); }
  catch { state.activeDrill = null; }
  return state.activeDrill;
}

// ───────── Notifications ─────────
async function loadNotifications() {
  try { state.notifications = await api.get('/notifications'); } catch { state.notifications = []; }
  renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  const unread = state.notifications.filter((n) => !n.read).length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread; badge.classList.toggle('hidden', unread === 0);

  list.innerHTML = state.notifications.slice(0, 50).map((n) => `
    <li class="${escapeHtml(n.severity || '')}">
      <div>${escapeHtml(n.message)}</div>
      <div class="t">${escapeHtml(n.type)} · ${timeAgo(n.ts)}</div>
    </li>`).join('') || '<li class="muted" style="padding:1rem">No notifications.</li>';
}

window.addEventListener('offline:synced', loadActiveDrill);
