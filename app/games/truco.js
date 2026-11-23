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

const rules = {
  es: {
    howItWorks: 'Se juega a 30 puntos: los primeros 15 son las malas y los segundos 15 las buenas. La app no reparte cartas ni sigue las manos: cuando una mano termina, tocas el bando que la ganó y tocas cuánto valía. Los puntos se dibujan como palillos, en grupos de cinco, igual que sobre la mesa.',
    scoring: [
      { name: 'Mano ganada sin cantar truco', value: '1' },
      { name: 'Truco', value: '2' },
      { name: 'Retruco', value: '3' },
      { name: 'Vale cuatro', value: '4' },
      { name: 'Envido', value: '2' },
      { name: 'Real envido', value: '3' },
      { name: 'Falta envido', value: 'lo que falte para cerrar' },
      { name: 'Flor', value: '3' },
      { name: 'Contraflor', value: '6' },
      { name: 'Contraflor al resto', value: 'lo que falte para cerrar' }
    ],
    houseRules: [
      'Se juega a 30: 15 de malas y 15 de buenas.',
      'El primero en llegar a 30 gana; no hay última ronda.',
      'Los botones cubren del 1 al 6, que son los cantos habituales. La falta envido y la contraflor al resto se escriben a mano, porque valen lo que falte.'
    ],
    note: 'La flor se juega o no se juega según la casa. La app no cambia las cuentas: solo cambia qué valores salen, así que acordadlo antes de empezar.'
  },
  en: {
    howItWorks: 'Played to 30 points: the first 15 are the malas, the second 15 the buenas. The app does not deal cards or follow the hands — when a hand finishes you tap the side that won and tap what it was worth. Points are drawn as toothpicks in groups of five, the way they are laid out on a table.',
    scoring: [
      { name: 'Hand won with no truco called', value: '1' },
      { name: 'Truco', value: '2' },
      { name: 'Retruco', value: '3' },
      { name: 'Vale cuatro', value: '4' },
      { name: 'Envido', value: '2' },
      { name: 'Real envido', value: '3' },
      { name: 'Falta envido', value: 'whatever is left to close' },
      { name: 'Flor', value: '3' },
      { name: 'Contraflor', value: '6' },
      { name: 'Contraflor al resto', value: 'whatever is left to close' }
    ],
    houseRules: [
      'Played to 30: 15 malas, then 15 buenas.',
      'First side to 30 wins; there is no final round.',
      'The buttons cover 1 to 6, which are the ordinary calls. Falta envido and contraflor al resto are typed in, because they are worth whatever is left.'
    ],
    note: 'Whether flor is played at all varies by house. It does not change the arithmetic here, only which values come up, so agree it before you start.'
  }
};

export const trucoDef = {
  id: 'truco',
  storageKey: 'truco',
  titleKey: 'gameTitle',
  strings,
  rules,
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
