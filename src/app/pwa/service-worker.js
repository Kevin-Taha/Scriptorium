/* The build replaces these placeholders after all Vite and pdf.js assets are emitted. */
const PRECACHE_URLS = __PRECACHE_URLS__;
const CACHE_PREFIX = `scriptorium-precache:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}__CACHE_VERSION__`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(
          PRECACHE_URLS.map((url) => new Request(new URL(url, self.registration.scope), { cache: 'reload' })),
        );
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const previous = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
      await Promise.all(previous.slice(0, -1).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const index = new URL('index.html', scope);
  if (
    event.request.mode === 'navigate' &&
    url.pathname !== scope.pathname &&
    url.pathname !== index.pathname
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // These are static build assets; Origin can vary between preload and document requests.
      if (event.request.mode === 'navigate') {
        return (await cache.match(index, { ignoreVary: true })) ?? fetch(event.request);
      }
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;

      // An older tab may still need a hashed chunk from the previous build.
      if (url.pathname.startsWith(new URL('assets/', scope).pathname)) {
        const names = await caches.keys();
        const previous = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
        for (const name of previous.reverse()) {
          const response = await (await caches.open(name)).match(event.request, { ignoreVary: true });
          if (response) return response;
        }
      }
      return fetch(event.request);
    })(),
  );
});
