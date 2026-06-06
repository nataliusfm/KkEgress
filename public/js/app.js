import { api, auth } from './api.js';
import { el, toast, timeAgo, escapeHtml } from './util.js';
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
  dashboard: { render: renderDashboard },
  map: { render: renderMap },
  report: { render: renderReport, roles: ['TEACHER'] },
  monitor: { render: renderMonitor, roles: ['COORDINATOR', 'SUPER_ADMIN'] },
  drills: { render: renderDrills, roles: ['SUPER_ADMIN'] },
  reports: { render: renderReports, roles: ['COORDINATOR', 'SUPER_ADMIN'] },
  admin: { render: renderAdmin, roles: ['SUPER_ADMIN'] },
};

// ───────── Internationalisation (shell) ─────────
const I18N = {
  en: {
    'nav.dashboard': 'Dashboard', 'nav.map': 'Live Map', 'nav.report': 'My Report',
    'nav.monitor': 'Team Monitor', 'nav.drills': 'Drills', 'nav.reports': 'Reports', 'nav.admin': 'Administration',
    'sec.navigation': 'NAVIGATION', 'sec.language': 'LANGUAGE', 'sec.signedInAs': 'SIGNED IN AS',
    'action.signout': 'Sign out', 'login.signin': 'Sign In', 'login.email': 'Email address', 'login.password': 'Password',
    'cta.drills': 'Start Drill', 'cta.monitor': 'Open Monitor', 'cta.report': 'Submit Report',
    'eyebrow.dashboard': 'OVERVIEW', 'title.dashboard': 'Drill dashboard',
    'eyebrow.map': 'TRACKING', 'title.map': 'Live map',
    'eyebrow.report': 'FIELD REPORT', 'title.report': 'My report',
    'eyebrow.monitor': 'REAL-TIME', 'title.monitor': 'Team monitor',
    'eyebrow.drills': 'MANAGEMENT', 'title.drills': 'Emergency drills',
    'eyebrow.reports': 'RECORDS', 'title.reports': 'Reports & exports',
    'eyebrow.admin': 'SETTINGS', 'title.admin': 'Administration',
  },
  id: {
    'nav.dashboard': 'Dasbor', 'nav.map': 'Peta Langsung', 'nav.report': 'Laporan Saya',
    'nav.monitor': 'Pemantauan Tim', 'nav.drills': 'Latihan', 'nav.reports': 'Laporan', 'nav.admin': 'Administrasi',
    'sec.navigation': 'NAVIGASI', 'sec.language': 'BAHASA', 'sec.signedInAs': 'MASUK SEBAGAI',
    'action.signout': 'Keluar', 'login.signin': 'Masuk', 'login.email': 'Alamat email', 'login.password': 'Kata sandi',
    'cta.drills': 'Mulai Latihan', 'cta.monitor': 'Buka Pemantauan', 'cta.report': 'Kirim Laporan',
    'eyebrow.dashboard': 'IKHTISAR', 'title.dashboard': 'Dasbor latihan',
    'eyebrow.map': 'PELACAKAN', 'title.map': 'Peta langsung',
    'eyebrow.report': 'LAPORAN LAPANGAN', 'title.report': 'Laporan saya',
    'eyebrow.monitor': 'WAKTU NYATA', 'title.monitor': 'Pemantauan tim',
    'eyebrow.drills': 'MANAJEMEN', 'title.drills': 'Latihan darurat',
    'eyebrow.reports': 'CATATAN', 'title.reports': 'Laporan & ekspor',
    'eyebrow.admin': 'PENGATURAN', 'title.admin': 'Administrasi',
  },
};
let currentLang = localStorage.getItem('sedts.lang') || 'en';
const t = (key) => (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;

function applyLanguage(lang) {
  currentLang = I18N[lang] ? lang : 'en';
  localStorage.setItem('sedts.lang', currentLang);
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((node) => { node.placeholder = t(node.dataset.i18nPh); });
  document.querySelectorAll('.lang-toggle [data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === currentLang));
  updateCta();
  refreshPageHead();
}

let currentRoute = null;
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
    state.config.schoolName || 'Yayasan Pendidikan Jayawijaya';
  setCrest('login-crest', state.config.logoUrl, '🚨');

  setupLogin();
  setupChrome();
  bindConnectivity();
  applyLanguage(currentLang);

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

  const domains = state.config.allowedEmailDomains || [];
  const domainHint = domains.length ? `Sign in with your ${domains.map((d) => '@' + d).join(' / ')} account` : 'Sign in with your school Google account';

  // Primary: Google school account
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
      { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 300 });
    const hint = document.getElementById('google-hint');
    hint.textContent = domainHint;
    hint.classList.remove('hidden');
  } else if (state.config.googleClientId) {
    // GIS script may still be loading; retry shortly.
    setTimeout(setupLogin, 400);
  } else {
    // Google not configured yet — guide the admin and reveal password login.
    const note = document.getElementById('google-missing');
    note.textContent = 'Google sign-in is not set up yet. Use email & password below, or set GOOGLE_CLIENT_ID to enable school-account sign-in.';
    note.classList.remove('hidden');
    document.getElementById('other-signin').open = true;
  }

  // Dev login (only when explicitly enabled)
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

/** Render the sidebar org title with the last word on a second line. */
function setBrandName(name) {
  const node = document.getElementById('sidebar-school-name');
  if (!node) return;
  const safe = escapeHtml(name || 'School');
  const i = safe.lastIndexOf(' ');
  node.innerHTML = i > 0 ? `${safe.slice(0, i)}<br>${safe.slice(i + 1)}` : safe;
}

/**
 * Set a crest element to a logo image, trying (1) the configured logoUrl,
 * then (2) a built-in /img/logo.png, and falling back to an emoji if neither
 * loads.
 */
function setCrest(id, url, fallback) {
  const node = document.getElementById(id);
  if (!node) return;
  const src = url || '/img/logo.png';
  const probe = new Image();
  probe.onload = () => { node.innerHTML = `<img src="${src}" alt="">`; node.classList.add('has-logo'); };
  probe.onerror = () => { node.textContent = fallback; node.classList.remove('has-logo'); };
  probe.src = src;
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

async function onAuthenticated(user) {
  state.user = user; auth.user = user;
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  // Signed-in footer
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-role').textContent = roleLabel(user.role);

  // Avatar: photo if available, otherwise initial
  const avatar = document.getElementById('user-avatar');
  const initialEl = document.getElementById('avatar-initial');
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  initialEl.textContent = initial;
  if (user.picture) { avatar.src = user.picture; avatar.style.display = 'block'; initialEl.style.display = 'none'; }
  else { avatar.style.display = 'none'; initialEl.style.display = 'block'; }

  setBrandName(state.config.schoolName || 'Yayasan Pendidikan Jayawijaya');

  applyRoleVisibility();
  updateCta();
  applyLanguage(currentLang);
  connectSocket();
  await loadBrand();
  await loadActiveDrill();
  await loadNotifications();
  syncPending();

  navigate(defaultRoute());
}

/** Sets the gold sidebar CTA based on the user's role. */
function updateCta() {
  const btn = document.getElementById('cta-action');
  if (!btn || !state.user) return;
  const map = {
    SUPER_ADMIN: { key: 'cta.drills', route: 'drills', icon: '🔥' },
    COORDINATOR: { key: 'cta.monitor', route: 'monitor', icon: '📡' },
    TEACHER: { key: 'cta.report', route: 'report', icon: '📝' },
  };
  const c = map[state.user.role] || map.TEACHER;
  btn.innerHTML = `<span>${c.icon}</span><span>${escapeHtml(t(c.key))}</span>`;
  btn.onclick = () => { navigate(c.route); closeNav(); };
}

/** Loads school branding (name + logo) for the sidebar crest. */
async function loadBrand() {
  try {
    const school = await api.get('/admin/school');
    if (school?.name) setBrandName(school.name);
    setCrest('brand-crest', school?.logoUrl, '🚨');
  } catch { /* ignore */ }
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
function closeNav() {
  document.getElementById('sidenav')?.classList.remove('open');
  document.getElementById('scrim')?.classList.remove('show');
}

function setupChrome() {
  const sidenav = document.getElementById('sidenav');
  const scrim = document.getElementById('scrim');

  document.getElementById('nav-toggle').addEventListener('click', () => {
    sidenav.classList.toggle('open'); scrim.classList.toggle('show');
  });
  scrim.addEventListener('click', closeNav);

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => { navigate(item.dataset.route); closeNav(); });
  });

  // Language toggles (sidebar + topbar share the same handler)
  document.querySelectorAll('.lang-toggle [data-lang]').forEach((b) => {
    b.addEventListener('click', () => applyLanguage(b.dataset.lang));
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
  currentRoute = route;

  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));

  if (typeof currentCleanup === 'function') { currentCleanup(); currentCleanup = null; }
  const content = document.getElementById('content');
  content.innerHTML = '';
  content.appendChild(el(
    `<header class="page-head"><p class="eyebrow">${escapeHtml(t('eyebrow.' + route))}</p>` +
    `<h1 class="page-title">${escapeHtml(t('title.' + route))}</h1></header>`
  ));
  content.scrollTop = 0;
  currentCleanup = def.render(content, ctx()) || null;
}

/** Re-translates the current page header in place (on language switch). */
function refreshPageHead() {
  if (!currentRoute) return;
  const eb = document.querySelector('.page-head .eyebrow');
  const ti = document.querySelector('.page-head .page-title');
  if (eb) eb.textContent = t('eyebrow.' + currentRoute);
  if (ti) ti.textContent = t('title.' + currentRoute);
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
