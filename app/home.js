// The home screen: a grid of game cards. For now, Yahtzee is the only
// game live; the others sit as "coming soon" placeholders so the shape
// of the app is visible from the start.

import { APP_NAME, APP_SHORT } from './core/config.js';
import { escapeHtml } from './core/ui.js';

const GAMES = [
  { id: 'yahtzee',  name: 'Yahtzee',  kind: 'dice',  href: '#/yahtzee',  desc: 'Score sheet for the classic 13-box dice game.' },
  { id: 'farkle',   name: 'Farkle',   kind: 'dice',  href: null,         desc: 'Push-your-luck dice game. Coming soon.' },
  { id: 'generala', name: 'Generala', kind: 'dice',  href: null,         desc: 'Yahtzee’s Argentine cousin. Coming soon.' },
  { id: 'truco',    name: 'Truco',    kind: 'cards', href: null,         desc: 'Card game, 30-point scorekeeper. Coming soon.' }
];

export function renderHome(container) {
  const cards = GAMES.map(g => {
    const soon = g.href === null;
    return `
      <a class="game-card${soon ? ' coming-soon' : ''}"
         href="${soon ? '#' : g.href}"
         aria-disabled="${soon}">
        <span class="game-card-kind">${g.kind}</span>
        <h2>${escapeHtml(g.name)}</h2>
        <span class="game-card-desc">${escapeHtml(g.desc)}</span>
      </a>
    `;
  }).join('');

  container.innerHTML = `
    <div class="home-header">
      <h1 class="home-brand"><span class="home-mark">${escapeHtml(APP_SHORT)}</span>${escapeHtml(APP_NAME)}</h1>
      <p class="home-tagline">Scorekeepers for dice and card games.</p>
    </div>
    <div class="game-grid">${cards}</div>
  `;
}
