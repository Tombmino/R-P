// Ronda y Punto — service worker.
//
// Strategy: network-first with a short timeout, falling back to cache.
//
// Why not cache-first (which this used to be): the app has no build
// step, so filenames are not content-hashed. A cache-first worker that
// has stored home.js keeps serving that copy indefinitely, and a new
// deploy silently never reaches anyone who has already opened the app.
// That is exactly what happened — four deploys landed on Netlify while
// the installed app carried on showing a three-deploy-old home screen.
//
// Why a timeout rather than plain network-first: the app is used at a
// table, sometimes on poor signal. Waiting three seconds for a page
// that works offline is worse than showing content one launch old, so
// a slow network falls through to the cache.
//
// Net effect: online, you always get the current version. Offline or on
// bad signal, you get the last one that loaded. Neither case can pin
// you to an old build forever.

const CACHE = 'ryp-v0.9.1';
const NETWORK_TIMEOUT_MS = 3000;

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
    caches.open(CACHE)
      // One missing file must not abort the whole install, or the old
      // worker stays in charge and the stale-content problem persists.
      .then((cache) => Promise.allSettled(ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // Kick the network off straight away and keep the promise, so a
    // timeout can fall back to cache while the fetch still completes
    // and refreshes the cache for next time.
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });

    try {
      return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      // Nothing cached to fall back to, so wait for the network after
      // all rather than failing on the timeout alone.
      return network;
    }
  })());
});
