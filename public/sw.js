// Service worker: network-first so fresh deploys always show when online,
// falling back to cache only when offline. API/realtime are never cached.
const CACHE = 'sedts-shell-v2';

self.addEventListener('install', (e) => {
  // Activate immediately; we populate the cache lazily from network responses.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  if (url.origin !== location.origin) return;

  // Network-first: always try the live server, cache a copy for offline use.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
