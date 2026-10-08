const CACHE_NAME = 'flexzora-v2';

// Only same-origin static assets are cacheable. API calls and auth traffic are
// never cached.
const isCacheable = (request, response) =>
  request.method === 'GET' &&
  new URL(request.url).origin === self.location.origin &&
  !request.url.includes('/auth/') &&
  !request.url.includes('/rest/') &&
  !request.url.includes('/functions/') &&
  response && response.ok;

self.addEventListener('install', (event) => {
  // Take over immediately — the previous cache-first worker pinned stale builds.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) =>
          cacheName !== CACHE_NAME ? caches.delete(cacheName) : undefined
        )
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigations: network-first so deployed updates are picked up, falling back
  // to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets: cache-first with background population.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (isCacheable(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
