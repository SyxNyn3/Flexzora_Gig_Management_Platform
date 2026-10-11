const CACHE_NAME = 'flexzora-v3';

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

// --- Web Push ---------------------------------------------------------------
// Payloads arrive from the send-push edge function: {title, body, url}.

self.addEventListener('push', (event) => {
  let data = { title: 'FlexZora', body: '', url: '/dashboard' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { url: data.url },
      tag: 'flexzora-alert',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) {
        existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
    })
  );
});
