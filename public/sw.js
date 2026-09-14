const CACHE_NAME = 'kipper-app-v8';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest?v=8',
  '/style.css?v=8',
  '/mobile-top-nav.css?v=8',
  '/v3.css?v=8',
  '/v4-round.css?v=8',
  '/v5-round.css?v=8',
  '/auth-ui.js?v=8',
  '/admin-management.js?v=8',
  '/icons/kipper-header-transparent-600.webp?v=8',
  '/icons/kipper-app-exact-180.png?v=8',
  '/icons/kipper-app-exact.svg?v=8'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      })
  );
});
