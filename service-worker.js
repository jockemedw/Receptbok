// Service worker — gör Receptboken installerbar (PWA) och snabbstartad.
//
// Strategi (medvetet konservativ — uppdateringsflödet med ?v=N ska inte störas):
//  - Navigeringar (index.html): ALLTID nätet först. Cachen används bara offline.
//  - JS-moduler: nätet först. De importeras utan ?v= och MÅSTE alltid matcha
//    aktuell index.html — en stale modul mot ny markup kan krascha hela vyn
//    (Session 101: gammal plan-viewer.js sökte #weekGrid som tagits bort).
//    Cache bara som offline-fallback.
//  - Övriga statiska filer (css/ikoner/typsnitt): stale-while-revalidate.
//  - /api/* och andra origins (Supabase, fonter): rörs INTE av service workern.
//
// CACHE_VERSION bumpas när precache-listan ändras — gamla cachar städas i activate.

const CACHE_VERSION = 'receptbok-v117';

const PRECACHE = [
  './',
  './index.html',
  './css/styles.css?v=199',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
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

  // Navigeringar: nätet först, cache bara som offline-fallback.
  // Bara STARTSIDAN får bli offline-fallback, och bara ett lyckat svar —
  // undersidor (roadmap.html, architecture.html) och 5xx-sidor skrev annars
  // över den cachade index.html (Session 143, Codex R14).
  if (req.mode === 'navigate') {
    const isStart = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    const networkPromise = fetch(req)
      .then((res) => {
        if (res.ok && isStart) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy)));
        }
        return res;
      })
      .catch(() => caches.match('./index.html'));
    // Håll eventet vid liv tills nätsvaret kommit även när timeouten vinner —
    // annars kan webbläsaren avbryta bakgrundshämtningen och cache-uppdateringen
    // ovan uteblir tyst på just det sega nät den är till för. Löftet kan inte
    // avvisas (catch ovan), så detta blockerar aldrig.
    event.waitUntil(networkPromise);

    // Om nätet inte svarar inom 4 s: visa cachad startsida direkt (om den finns)
    // medan nätsvaret fortsätter i bakgrunden — annars vänta kvar på nätet.
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        caches.match('./index.html').then((cached) => {
          if (cached) resolve(cached);
          // Ingen cache — låt networkPromise avgöra (resolve aldrig här).
        });
      }, 4000);
    });

    event.respondWith(Promise.race([networkPromise, timeoutPromise]));
    return;
  }

  // JS-moduler: nätet först (importeras utan ?v= → måste matcha aktuell markup).
  // Cache uppdateras vid varje lyckad hämtning och används bara offline.
  if (/\.(m?js)(\?|$)/.test(url.pathname + url.search)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Övriga statiska filer (css/ikoner/typsnitt): stale-while-revalidate
  // (nyckel = full URL inkl. ?v=N).
  if (/\.(css|png|svg|webmanifest|woff2?)(\?|$)/.test(url.pathname + url.search)) {
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
