// Offline cache for Ronda y Punto.
// Bump CACHE_VERSION whenever any asset changes so old caches are evicted.
const CACHE_VERSION = 'ryp-v0.5.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './styles.css',
  './main.js',
  './home.js',
  './core/config.js',
  './core/storage.js',
  './core/ui.js',
  './games/yahtzee.js'
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
