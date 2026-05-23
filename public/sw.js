const CACHE_NAME = 'disney-mayhem-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './DisneyMayhem-WM.svg',
  './disneymayhem-background.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function shouldHandleRequest(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!shouldHandleRequest(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            void cache.put(request, responseCopy);
          });
        }

        return response;
      });
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: event.data?.text(),
    };
  }

  const title = typeof payload.title === 'string' ? payload.title : '\u2063';
  const options = {
    body: payload.body || '',
    icon: './icon-192.png',
    badge: './favicon.png',
    data: {
      url: payload.url || './',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || './', self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url.startsWith(self.registration.scope));

      if (matchingClient) {
        matchingClient.focus();
        return matchingClient.navigate(targetUrl);
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
