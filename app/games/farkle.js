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

export const farkleDef = {
  id: 'farkle',
  storageKey: 'farkle',
  version: 'v0.7',
  titleKey: 'gameTitle',
  strings,
  target: TARGET,
  minSides: 2,
  maxSides: 8,
  sideKind: 'player',
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
