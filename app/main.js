// App shell: registers the service worker, catches the install prompt,
// and routes between the home screen and each game module by hash.

import { renderHome } from './home.js';
import { renderYahtzee } from './games/yahtzee.js';
import { renderGenerala } from './games/generala.js';

// --- Service worker ----------------------------------------------------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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
  '#/generala': { id: 'generala',  render: renderGenerala }
};

// Each game gets one accent colour (see styles.css) so two score sheets
// that look alike — Yahtzee and Generala — are never mistaken for each
// other at a glance. Only game-* classes are touched, so the `dark`
// class set by the theme toggle survives navigation.
function setGameClass(id) {
  [...document.body.classList]
    .filter(c => c.startsWith('game-'))
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
