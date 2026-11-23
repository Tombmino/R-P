// The home screen: a grid of game cards. Games without a route yet sit
// as "coming soon" placeholders so the shape of the app is visible from
// the start.

import { APP_NAME, APP_SHORT } from './core/config.js';
import { escapeHtml } from './core/ui.js';

const GAMES = [
  { id: 'yahtzee',  name: 'Yahtzee',  kind: 'dice',  href: '#/yahtzee',
    desc: 'The classic 13-box score sheet.' },
  { id: 'generala', name: 'Generala', kind: 'dice',  href: '#/generala',
    desc: '10 boxes, servida bonuses, instant win.' },
  { id: 'farkle',   name: 'Farkle',   kind: 'dice',  href: '#/farkle',
    desc: 'Push your luck, then bank it.' },
  { id: 'truco',    name: 'Truco',    kind: 'cards', href: '#/truco',
    desc: 'To 30, counted on toothpicks.' }
];

export function renderHome(container) {
  const cards = GAMES.map(g => {
    const soon = g.href === null;
    return `
      <a class="game-card game-card-${g.id}${soon ? ' coming-soon' : ''}"
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
