// Farkle: a definition for the shared running-total engine.
//
// Rules implemented (agreed 22 Nov 2026), currently at their defaults —
// the settings screen that exposes them is a later piece of work:
//   Target            10,000 points (5,000 and custom also planned)
//   Opening minimum    500 in a single turn to get on the board
//   Three farkles      -1,000 when a player farkles three turns running
//   Final round        on: once someone passes the target, everyone
//                      else gets one more turn to overtake
//
// The app never rolls dice. Players roll six real dice, work out what
// they scored, build the turn up with the +chips (or type it), then tap
// Bank to keep it or Farkle to lose it. That is exactly the decision
// the game is about, and it stays at the table.
//
// Visual: red accent and red score squares, echoing the red dice Farkle
// is traditionally played with (user request, 23 Nov).

import { mountRunningTotal } from '../core/running-total.js';

const TARGET = 10000;
const OPENING_MIN = 500;
const FARKLE_PENALTY = -1000;
const FARKLES_BEFORE_PENALTY = 3;

const strings = {
  es: {
    gameTitle: 'Farkle',
    installPrompt: '📲 Instalar Ronda y Punto',
    bank: '💰 Guardar',
    farkle: '💀 Farkle',
    openingMinToast: `Necesitas ${OPENING_MIN} en un turno para abrir`,
    farkleToast: 'Farkle · pierdes los puntos del turno',
    penaltyToast: `3 farkles seguidos · ${FARKLE_PENALTY} puntos`,
    targetLong: (n) => `Primero en llegar a ${n} gana · abre con ${OPENING_MIN}`
  },
  en: {
    gameTitle: 'Farkle',
    installPrompt: '📲 Install Ronda y Punto',
    bank: '💰 Bank',
    farkle: '💀 Farkle',
    openingMinToast: `You need ${OPENING_MIN} in one turn to get on the board`,
    farkleToast: 'Farkle · you lose this turn’s points',
    penaltyToast: `3 farkles in a row · ${FARKLE_PENALTY} points`,
    targetLong: (n) => `First to ${n} wins · open with ${OPENING_MIN}`
  }
};

const rules = {
  es: {
    howItWorks: 'Tiras los seis dados. Apartas los que puntúan y decides: vuelves a tirar los que quedan para sumar más, o guardas lo acumulado y pasas. Si una tirada no puntúa nada, haces "farkle" y pierdes todo lo acumulado en ese turno. El primero en pasar de 10.000 da pie a una última ronda para los demás.',
    scoring: [
      { name: 'Un 1 suelto', value: '100' },
      { name: 'Un 5 suelto', value: '50' },
      { name: 'Tres unos', value: '1.000' },
      { name: 'Tres iguales (cualquier otro número)', value: 'ese número × 100' },
      { name: 'Cuatro iguales', value: '1.000' },
      { name: 'Cinco iguales', value: '2.000' },
      { name: 'Seis iguales', value: '3.000' },
      { name: 'Escalera del 1 al 6', value: '1.500' },
      { name: 'Tres parejas', value: '1.500' },
      { name: 'Tirada sin puntos (farkle)', value: 'pierdes el turno' }
    ],
    houseRules: [
      'Se juega a 10.000 puntos.',
      'Para abrir hace falta guardar 500 o más en un solo turno.',
      'Tres farkles seguidos cuestan 1.000 puntos.',
      'Última ronda: cuando alguien pasa de 10.000, el resto tiene un turno más para adelantarle.'
    ],
    note: 'Las combinaciones de Farkle cambian mucho de casa en casa. Estas son las más habituales; acordadlas antes de empezar si alguien juega distinto.'
  },
  en: {
    howItWorks: 'Roll all six dice. Set aside the ones that score, then choose: roll the rest to add more, or bank what you have and pass. If a roll scores nothing you have farkled, and everything built up that turn is gone. The first player past 10,000 gives everyone else one last turn.',
    scoring: [
      { name: 'A single 1', value: '100' },
      { name: 'A single 5', value: '50' },
      { name: 'Three ones', value: '1,000' },
      { name: 'Three of a kind (any other number)', value: 'that number × 100' },
      { name: 'Four of a kind', value: '1,000' },
      { name: 'Five of a kind', value: '2,000' },
      { name: 'Six of a kind', value: '3,000' },
      { name: 'A run of 1 to 6', value: '1,500' },
      { name: 'Three pairs', value: '1,500' },
      { name: 'A roll that scores nothing (farkle)', value: 'lose the turn' }
    ],
    houseRules: [
      'Played to 10,000 points.',
      'You must bank 500 or more in a single turn to get on the board.',
      'Three farkles in a row costs 1,000 points.',
      'Final round: once someone passes 10,000, everyone else gets one more turn to overtake.'
    ],
    note: 'Farkle combinations vary a lot from house to house. These are the common ones — agree them before you start if anyone plays differently.'
  }
};

export const farkleDef = {
  id: 'farkle',
  storageKey: 'farkle',
  titleKey: 'gameTitle',
  strings,
  rules,
  target: TARGET,
  minSides: 2,
  // Six, to match the six player colours one-to-one.
  maxSides: 6,
  sideKind: 'player',
  playerColors: true,
  defaultSideCount: 2,
  finalRound: true,

  // Two-phase: build the turn up, then Bank or Farkle. This is the
  // push-your-luck decision, so it needs to be visible and reversible
  // before it's committed.
  twoPhase: true,

  entry: {
    // The combinations that come up most: a single 1 or 5, three of a
    // kind, a straight or three pairs. Anything unusual gets typed.
    presets: [50, 100, 150, 200, 300, 400, 500, 1000, 1500],
    allowTyped: true,
    max: TARGET
  },

  actions: [
    {
      id: 'bank',
      labelKey: 'bank',
      className: 'primary',
      run: (api) => {
        if (api.state.pending <= 0) return;
        api.commit(api.state.pending, 'score');
      }
    },
    {
      id: 'farkle',
      labelKey: 'farkle',
      className: 'danger-outline',
      run: (api) => {
        api.state.pending = 0;
        api.commit(0, 'farkle');
        api.toast('farkleToast');
      }
    }
  ],

  // A player who is not yet on the board must bank at least the opening
  // minimum. A farkle (0) is always allowed through.
  validateCommit: (side, amount, dict, api) => {
    if (amount <= 0) return null;
    const onBoard = api.totalOf(side) > 0;
    if (!onBoard && amount < OPENING_MIN) return 'openingMinToast';
    return null;
  },

  // Three farkles in a row costs 1,000. The penalty is recorded as its
  // own entry in the turn log so the sheet shows where it came from and
  // undo can take it back with the turn that triggered it.
  afterCommit: (side, entry, api) => {
    if (entry.kind !== 'farkle') return;
    if (api.trailingRun(side, 'farkle') < FARKLES_BEFORE_PENALTY) return;
    api.adjust(side, FARKLE_PENALTY, 'penalty');
    api.toast('penaltyToast');
  }
};

export function renderFarkle(container) {
  mountRunningTotal(container, farkleDef);
}
