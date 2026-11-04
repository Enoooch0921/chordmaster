const CACHE_NAME = 'chordmaster-pwa-v2';
// Filled by the production build, including lazy routes and PDF export chunks.
const BUILD_ASSETS = [];
const APP_SHELL_PATHS = [
  ...BUILD_ASSETS,
  './',
  './site.webmanifest',
  './logo.svg',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/JianpuASCII.ttf',
  './fonts/BachRhythm.ttf',
  './fonts/Bach41.ttf',
  './fonts/Bach.ttf',
  './fonts/BachSlurs.ttf',
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

const putIfOk = async (cache, url, required = false) => {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok) {
      await cache.put(url, response);
    } else if (required) {
      throw new Error(`Required offline asset unavailable: ${url}`);
    }
  } catch (error) {
    // A partial release must never replace the working offline version.
    if (required) throw error;
  }
};

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const appShellUrl = toScopedUrl('./');
  const appShellResponse = await fetch(appShellUrl, { cache: 'reload' });

  if (!appShellResponse.ok) throw new Error('Offline app shell unavailable');
  await cache.put(appShellUrl, appShellResponse.clone());
  const required = new Set([
    ...BUILD_ASSETS,
    './fonts/JianpuASCII.ttf',
    './fonts/BachRhythm.ttf',
    './fonts/BachSlurs.ttf',
  ].map(toScopedUrl));

  const urls = new Set([
    ...APP_SHELL_PATHS.map(toScopedUrl),
    ...await extractSameOriginAssets(appShellResponse),
  ]);

  await Promise.all(Array.from(urls, (url) => putIfOk(cache, url, required.has(url))));
};

self.addEventListener('install', (event) => {
  // Keep the current worker and its complete asset cache while any page is
  // open. A waiting update activates naturally after the last page closes;
  // or after an explicit update request. Never reload on-stage sessions.
  event.waitUntil(cacheAppShell());
});

self.addEventListener('message', (event) => {
  // Only a same-scope window may explicitly activate a fully installed update.
  if (event.data?.type !== 'CHORDMASTER_ACTIVATE_UPDATE' || !event.source?.url
    || !isCacheableSameOriginUrl(event.source.url)) return;
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const openPages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // An explicit update must retain older tabs' lazy chunks, including offline
    // performance sessions. Prune old builds on a later activation with no pages.
    if (openPages.length === 0) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith('chordmaster-pwa-') && name !== CACHE_NAME)
        .map(name => caches.delete(name)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !isCacheableSameOriginUrl(request.url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(toScopedUrl('./')) || await cache.match(request);
        // This HTML belongs to the worker's fully installed asset set. Serve it
        // immediately even when a weak connection never rejects its fetch.
        // Registration still checks for updates; a complete new worker takes
        // over on request or when old pages close, without mixing release assets.
        if (cached) return cached;
        return fetch(request);
      })()
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
