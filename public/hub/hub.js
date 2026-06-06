/* School Hub — renders branches + app tiles from window.HUB_CONFIG. */
(function () {
  const cfg = window.HUB_CONFIG || { org: {}, branches: [], apps: [] };

  // ── i18n (shell) ──
  const I18N = {
    en: {
      'sec.branches': 'BRANCHES', 'sec.language': 'LANGUAGE', 'sec.poweredBy': 'POWERED BY',
      'cta.request': 'Request an app', 'eyebrow': 'PORTAL', 'title': 'Applications',
      'desc': 'Open any of your school systems below. New tools appear here as they go live.',
      'open': 'Open app', 'soon': 'Coming soon', 'live': 'Live',
    },
    id: {
      'sec.branches': 'CABANG', 'sec.language': 'BAHASA', 'sec.poweredBy': 'DIDUKUNG OLEH',
      'cta.request': 'Ajukan aplikasi', 'eyebrow': 'PORTAL', 'title': 'Aplikasi',
      'desc': 'Buka sistem sekolah Anda di bawah ini. Alat baru akan muncul di sini saat tersedia.',
      'open': 'Buka aplikasi', 'soon': 'Segera hadir', 'live': 'Aktif',
    },
  };
  let lang = localStorage.getItem('hub.lang') || 'en';
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let activeBranch = cfg.branches[0]?.id || 'all';

  // ── Branding ──
  if (cfg.org.name) {
    const safe = esc(cfg.org.name);
    const i = safe.lastIndexOf(' ');
    $('org-name').innerHTML = i > 0 ? `${safe.slice(0, i)}<br>${safe.slice(i + 1)}` : safe;
  }
  if (cfg.org.tagline) { $('org-tagline').textContent = cfg.org.tagline; $('topbar-title').textContent = cfg.org.tagline; }
  if (cfg.org.short) { $('org-short').textContent = cfg.org.short; $('avatar').textContent = cfg.org.short.charAt(0).toUpperCase(); }
  // Logo: configured URL → built-in /img/logo.png → emoji fallback.
  (function setCrest() {
    const node = $('brand-crest');
    const src = cfg.org.logoUrl || '/img/logo.png';
    const probe = new Image();
    probe.onload = () => { node.innerHTML = `<img src="${esc(src)}" alt="">`; node.classList.add('has-logo'); };
    probe.onerror = () => { node.textContent = '🏫'; };
    probe.src = src;
  })();

  // ── Branches ──
  function renderBranches() {
    $('branch-list').innerHTML = cfg.branches.map((b) =>
      `<button class="branch-item ${b.id === activeBranch ? 'active' : ''}" data-branch="${esc(b.id)}">
        <span class="branch-ico">▦</span><span>${esc(b.name)}</span>
      </button>`).join('');
    document.querySelectorAll('[data-branch]').forEach((el) => el.addEventListener('click', () => {
      activeBranch = el.dataset.branch;
      renderBranches(); renderApps(); closeNav();
    }));
  }

  // ── App tiles ──
  function appsForBranch() {
    return cfg.apps.filter((a) => {
      const br = a.branches || ['*'];
      return activeBranch === 'all' || br.includes('*') || br.includes(activeBranch);
    });
  }

  function renderApps() {
    const branch = cfg.branches.find((b) => b.id === activeBranch);
    $('page-title').textContent = branch && branch.id !== 'all' ? branch.name : t('title');
    $('page-eyebrow').textContent = t('eyebrow');
    $('page-desc').textContent = t('desc');

    $('app-grid').innerHTML = appsForBranch().map((a) => {
      const live = a.status === 'live' && a.url;
      return `<article class="tile ${live ? 'live' : 'soon'}" ${live ? `data-url="${esc(a.url)}"` : ''}>
        <div class="tile-top">
          <div class="tile-icon">${esc(a.icon || '▦')}</div>
          <span class="status-pill ${live ? 'live' : 'soon'}">${live ? t('live') : t('soon')}</span>
        </div>
        <h2 class="tile-name">${esc(a.name)}</h2>
        <p class="tile-desc">${esc(a.desc || '')}</p>
        <div class="tile-action">${live ? `${t('open')} →` : t('soon')}</div>
      </article>`;
    }).join('');

    document.querySelectorAll('.tile.live').forEach((el) =>
      el.addEventListener('click', () => window.open(el.dataset.url, '_blank', 'noopener')));
  }

  // ── Language ──
  function applyLanguage(next) {
    lang = I18N[next] ? next : 'en';
    localStorage.setItem('hub.lang', lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('.lang-toggle [data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    renderApps();
  }
  document.querySelectorAll('.lang-toggle [data-lang]').forEach((b) =>
    b.addEventListener('click', () => applyLanguage(b.dataset.lang)));

  // ── Mobile nav ──
  function closeNav() { $('sidenav').classList.remove('open'); $('scrim').classList.remove('show'); }
  $('nav-toggle').addEventListener('click', () => { $('sidenav').classList.toggle('open'); $('scrim').classList.toggle('show'); });
  $('scrim').addEventListener('click', closeNav);

  // ── Boot ──
  renderBranches();
  applyLanguage(lang);
})();
