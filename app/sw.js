// Offline cache for Ronda y Punto.
// Bump CACHE_VERSION whenever any asset changes so old caches are evicted.
const CACHE_VERSION = 'ryp-v0.9.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './styles.css',
  './main.js',
  './home.js',
  './core/config.js',
  './core/storage.js',
  './core/ui.js',
  './core/i18n.js',
  './core/standings.js',
  './core/colors.js',
  './core/rules.js',
  './core/speech.js',
  './core/scorecard.js',
  './core/running-total.js',
  './games/yahtzee.js',
  './games/generala.js',
  './games/farkle.js',
  './games/truco.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
