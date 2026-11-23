// App shell: registers the service worker, catches the install prompt,
// and routes between the home screen and each game module by hash.

import { renderHome } from './home.js';
import { renderYahtzee } from './games/yahtzee.js';
import { renderGenerala } from './games/generala.js';
import { renderFarkle } from './games/farkle.js';
import { renderTruco } from './games/truco.js';

// --- Service worker ----------------------------------------------------
// Registering is only half of it. A browser decides for itself when to
// re-check sw.js, which can leave a device running a build that is days
// old — exactly what happened here, twice. So: force an update check on
// every load, and when a new worker actually takes over, reload once so
// the person sees the new version immediately instead of on some later
// visit.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Whether a worker was already in charge before this page loaded. On
  // a first-ever visit the new worker claims the page as a matter of
  // course, and reloading for that would be a pointless flash.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

// --- Install prompt ---------------------------------------------------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.add('visible');
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('visible');
});

export function installPromptAvailable() {
  return deferredInstallPrompt !== null;
}
export async function triggerInstallPrompt() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
}

// --- Router -----------------------------------------------------------
// Each entry renders fully into the app container. Switching replaces
// the content, so games own their own DOM, listeners and modals without
// bleeding into one another.
const ROUTES = {
  '':           { id: null,        render: renderHome },
  '#/':         { id: null,        render: renderHome },
  '#/yahtzee':  { id: 'yahtzee',   render: renderYahtzee },
  '#/generala': { id: 'generala',  render: renderGenerala },
  '#/farkle':   { id: 'farkle',    render: renderFarkle },
  '#/truco':    { id: 'truco',     render: renderTruco }
};

// Each game gets one accent colour (see styles.css) so two score sheets
// that look alike — Yahtzee and Generala — are never mistaken for each
// other at a glance. Only game-* classes are touched, so the `dark`
// class set by the theme toggle survives navigation.
function setGameClass(id) {
  [...document.body.classList]
    .filter(c => c.startsWith('game-') || c.startsWith('pc-'))
    .forEach(c => document.body.classList.remove(c));
  if (id) document.body.classList.add('game-' + id);
}

function route() {
  const app = document.getElementById('app');
  if (!app) return;
  const entry = ROUTES[location.hash] || ROUTES['#/'];
  app.innerHTML = '';
  setGameClass(entry.id);
  entry.render(app);
}

window.addEventListener('hashchange', route);
route();
