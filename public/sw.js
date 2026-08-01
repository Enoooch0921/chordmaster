const CACHE_NAME = 'chordmaster-pwa-v1';
const APP_SHELL_PATHS = [
  './',
  './site.webmanifest',
  './logo.svg',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const toScopedUrl = (path) => new URL(path, self.registration.scope).toString();

const isCacheableSameOriginUrl = (url) => {
  const parsedUrl = new URL(url, self.location.href);
  return parsedUrl.origin === self.location.origin &&
    parsedUrl.href.startsWith(self.registration.scope);
};

const extractSameOriginAssets = async (response) => {
  const html = await response.text();
  const matches = html.matchAll(/(?:href|src)="([^"]+)"/g);
  return Array.from(matches, ([, rawUrl]) => new URL(rawUrl, self.registration.scope).toString())
    .filter(isCacheableSameOriginUrl);
};

const putIfOk = async (cache, url) => {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch (_) {
    // Best-effort warm cache. Runtime fetches will fill any missed asset later.
  }
};

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const appShellUrl = toScopedUrl('./');
  const appShellResponse = await fetch(appShellUrl, { cache: 'reload' });

  if (appShellResponse.ok) {
    await cache.put(appShellUrl, appShellResponse.clone());
  }

  const urls = new Set([
    ...APP_SHELL_PATHS.map(toScopedUrl),
    ...await extractSameOriginAssets(appShellResponse),
  ]);

  await Promise.all(Array.from(urls, (url) => putIfOk(cache, url)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !isCacheableSameOriginUrl(request.url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(toScopedUrl('./'), response.clone());
          }
          return response;
        })
        .catch(async () => {
          return await caches.match(request) ||
            await caches.match(toScopedUrl('./'));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        });
      })
  );
});
