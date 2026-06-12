// Service worker — gör Receptboken installerbar (PWA) och snabbstartad.
//
// Strategi (medvetet konservativ — uppdateringsflödet med ?v=N ska inte störas):
//  - Navigeringar (index.html): ALLTID nätet först. Cachen används bara offline.
//  - Statiska filer (css/js/ikoner, samma origin): stale-while-revalidate —
//    serveras direkt ur cache, uppdateras i bakgrunden till nästa besök.
//  - /api/* och andra origins (Supabase, fonter): rörs INTE av service workern.
//
// CACHE_VERSION bumpas när precache-listan ändras — gamla cachar städas i activate.

const CACHE_VERSION = 'receptbok-v10';

const PRECACHE = [
  './',
  './index.html',
  './css/styles.css?v=105',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, fonter m.m. → orörda
  if (url.pathname.includes('/api/')) return;        // API:t cachas aldrig

  // Navigeringar: nätet först, cache bara som offline-fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Statiska filer: stale-while-revalidate (nyckel = full URL inkl. ?v=N)
  if (/\.(css|js|mjs|png|svg|webmanifest|woff2?)(\?|$)/.test(url.pathname + url.search)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    );
  }
});
