// App shell: registers the service worker, catches the install prompt,
// and routes between the home screen and each game module by hash.

import { renderHome } from './home.js';
import { renderYahtzee } from './games/yahtzee.js';

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
// Each entry renders fully into the app container. Switching replaces the
// content, so games can own their own DOM, listeners and modals without
// bleeding into one another.
const ROUTES = {
  '':          renderHome,
  '#/':        renderHome,
  '#/yahtzee': renderYahtzee
};

function route() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const handler = ROUTES[location.hash] || renderHome;
  handler(app);
}

window.addEventListener('hashchange', route);
route();
