// Truco: a definition for the shared running-total engine.
//
// Truco Argentino, played to 30. The first 15 points are the "malas",
// the second 15 the "buenas" — a distinction that matters at the table
// because falta envido is worth whatever is left to finish the current
// half, so the sheet has to make the halfway line obvious.
//
// Scored the traditional way: points are drawn as palillos (toothpicks)
// in groups of five — four uprights crossed by a diagonal — with the
// malas and the buenas separated by a line, and the numeral alongside
// for quick reading (user request, 23 Nov).
//
// The app does not deal cards or track hands. A hand resolves in favour
// of one side; you tap that side and tap what it was worth. Because of
// that, scoring does NOT rotate: the side you are scoring for stays
// selected (rotateAfterCommit: false).
//
// Point values the chips cover:
//   1  hand won with no truco called
//   2  truco · envido
//   3  retruco · real envido · flor
//   4  vale cuatro
//   6  contra flor
// Falta envido and contra flor al resto are worth whatever remains, so
// they are typed rather than given a chip.

import { mountRunningTotal } from '../core/running-total.js';

const TARGET = 30;
const HALF = TARGET / 2;   // malas / buenas boundary

const strings = {
  es: {
    gameTitle: 'Truco',
    installPrompt: '📲 Instalar Ronda y Punto',
    buenas: 'Buenas',
    teams: 'Equipos',
    scoringFor: 'Anotando a:',
    entryTitle: 'Puntos de la mano',
    targetShort: (n) => `A ${n}`,
    targetLong: () => `A ${TARGET} · ${HALF} malas, ${HALF} buenas`,
    reachedTarget: '¡Ganó!',
    noTurnsYet: 'Sin puntos todavía',
    inputPlaceholder: (max) => `Puntos (1 - ${max})`
  },
  en: {
    gameTitle: 'Truco',
    installPrompt: '📲 Install Ronda y Punto',
    buenas: 'Buenas',
    teams: 'Teams',
    scoringFor: 'Scoring for:',
    entryTitle: 'Points for the hand',
    targetShort: (n) => `To ${n}`,
    targetLong: () => `To ${TARGET} · ${HALF} malas then ${HALF} buenas`,
    reachedTarget: 'Won!',
    noTurnsYet: 'No points yet',
    inputPlaceholder: (max) => `Points (1 - ${max})`
  }
};

// Draw n points as toothpick groups: four uprights and a diagonal per
// five. The fifth <span> in a full group is restyled by CSS into the
// diagonal that crosses the other four.
function tallyGroups(n) {
  let html = '';
  let left = n;
  while (left > 0) {
    const inGroup = Math.min(5, left);
    html += `<span class="tally-group${inGroup === 5 ? ' of-five' : ''}">` +
      '<span class="tally-stick"></span>'.repeat(inGroup) +
      '</span>';
    left -= inGroup;
  }
  return html;
}

function renderTotal(total) {
  const malas = Math.min(Math.max(total, 0), HALF);
  const buenas = Math.max(0, Math.min(total, TARGET) - HALF);
  return (
    `<span class="tally">${tallyGroups(malas)}` +
    (buenas > 0 ? `<span class="tally-split"></span>${tallyGroups(buenas)}` : '') +
    `</span><span class="tally-num">${total}</span>`
  );
}

export const trucoDef = {
  id: 'truco',
  storageKey: 'truco',
  version: 'v0.7',
  titleKey: 'gameTitle',
  strings,
  target: TARGET,
  // Two sides for pairs or a head-to-head; three for 1v1v1.
  minSides: 2,
  maxSides: 3,
  sideKind: 'team',
  defaultSideCount: 2,
  defaultSideNames: () => ['Nosotros', 'Ellos'],
  // Nothing rotates, so the header reads "Scoring for:" not "Turn:".
  activePlayerLabelKey: 'scoringFor',

  // One-phase: a hand resolves and you record it straight away. There
  // is nothing to bank.
  twoPhase: false,
  rotateAfterCommit: false,
  finalRound: false,

  entry: {
    presets: [1, 2, 3, 4, 5, 6],
    allowTyped: true,
    max: TARGET
  },
  actions: [],

  // The halfway line: crossing 15 moves a side from malas to buenas.
  milestone: { at: HALF, labelKey: 'buenas' },

  renderTotal
};

export function renderTruco(container) {
  mountRunningTotal(container, trucoDef);
}
