// Yahtzee: a definition for the shared scorecard engine.
// Scoring rules, categories and wording live here; everything mechanical
// (state, storage, undo, players, rendering, standings, history) is in
// core/scorecard.js.

import { mountScorecard } from '../core/scorecard.js';

const strings = {
  es: {
    gameTitle: 'Yahtzee',
    installPrompt: '📲 Instalar Ronda y Punto',
    upperSection: 'Sección Superior',
    upperSubtotal: 'Subtotal Superior',
    upperBonus: 'Bono Superior (≥ 63 pts)',
    bonusRemaining: (n) => `Faltan ${n} pts para bono de +35`,
    bonusReached: '¡Objetivo de 63 pts alcanzado!',
    lowerSection: 'Sección Inferior',
    extraTitle: 'Bono Yahtzee Extra (+100 c/u)',
    extraDesc: 'Por cada Yahtzee adicional tras obtener 50 pts',
    needYahtzeeToast: 'Primero anota un Yahtzee de 50 pts',
    scoreFixed: (pts) => `Anotar ${pts} puntos`,
    inputPlaceholder: (max) => `Puntos (0 - ${max})`,
    categories: {
      ones:       { name: 'Unos (Aces)',       desc: 'Suma de todos los 1' },
      twos:       { name: 'Doses',             desc: 'Suma de todos los 2' },
      threes:     { name: 'Treses',            desc: 'Suma de todos los 3' },
      fours:      { name: 'Cuatros',           desc: 'Suma de todos los 4' },
      fives:      { name: 'Cincos',            desc: 'Suma de todos los 5' },
      sixes:      { name: 'Seises',            desc: 'Suma de todos los 6' },
      threeKind:  { name: 'Trío (3 Iguales)',  desc: 'Suma de los 5 dados' },
      fourKind:   { name: 'Póker (4 Iguales)', desc: 'Suma de los 5 dados' },
      fullHouse:  { name: 'Full House',        desc: 'Trío + pareja · 25 pts' },
      smStraight: { name: 'Escalera Menor',    desc: '4 dados consecutivos · 30 pts' },
      lgStraight: { name: 'Escalera Mayor',    desc: '5 dados consecutivos · 40 pts' },
      yahtzee:    { name: 'Yahtzee',           desc: '5 dados iguales · 50 pts' },
      chance:     { name: 'Suerte (Chance)',   desc: 'Suma de los 5 dados' }
    }
  },
  en: {
    gameTitle: 'Yahtzee',
    installPrompt: '📲 Install Ronda y Punto',
    upperSection: 'Upper Section',
    upperSubtotal: 'Upper Subtotal',
    upperBonus: 'Upper Bonus (≥ 63 pts)',
    bonusRemaining: (n) => `${n} pts needed for +35 bonus`,
    bonusReached: '63 pts bonus target reached!',
    lowerSection: 'Lower Section',
    extraTitle: 'Extra Yahtzee Bonus (+100 ea)',
    extraDesc: 'For each additional Yahtzee after scoring 50',
    needYahtzeeToast: 'Score a Yahtzee (50) first',
    scoreFixed: (pts) => `Score ${pts} points`,
    inputPlaceholder: (max) => `Points (0 - ${max})`,
    categories: {
      ones:       { name: 'Ones (Aces)',      desc: 'Sum of all 1s' },
      twos:       { name: 'Twos',             desc: 'Sum of all 2s' },
      threes:     { name: 'Threes',           desc: 'Sum of all 3s' },
      fours:      { name: 'Fours',            desc: 'Sum of all 4s' },
      fives:      { name: 'Fives',            desc: 'Sum of all 5s' },
      sixes:      { name: 'Sixes',            desc: 'Sum of all 6s' },
      threeKind:  { name: 'Three of a Kind',  desc: 'Sum of all 5 dice' },
      fourKind:   { name: 'Four of a Kind',   desc: 'Sum of all 5 dice' },
      fullHouse:  { name: 'Full House',       desc: '3 of a kind + pair · 25 pts' },
      smStraight: { name: 'Small Straight',   desc: '4 sequential dice · 30 pts' },
      lgStraight: { name: 'Large Straight',   desc: '5 sequential dice · 40 pts' },
      yahtzee:    { name: 'Yahtzee',          desc: '5 of a kind · 50 pts' },
      chance:     { name: 'Chance',           desc: 'Sum of all 5 dice' }
    }
  }
};

// The largest possible sum of five dice is 30, so free-entry boxes
// (Three/Four of a Kind, Chance) can never legally exceed it.
const MAX_DICE_SUM = 30;
const SUM_PRESETS = [10, 15, 18, 20, 22, 24, 25, 28, 30];

export const yahtzeeDef = {
  id: 'yahtzee',
  storageKey: 'yahtzee',
  version: 'v0.7',
  titleKey: 'gameTitle',
  maxPlayers: 6,
  playerColors: true,
  strings,
  sections: [
    {
      id: 'upper',
      labelKey: 'upperSection',
      subtotalKey: 'upperSubtotal',
      // 63 in the upper section earns +35 — the standard Hasbro bonus.
      bonus: {
        threshold: 63,
        value: 35,
        labelKey: 'upperBonus',
        remainingKey: 'bonusRemaining',
        reachedKey: 'bonusReached'
      },
      categories: [
        { id: 'ones',   entry: { kind: 'face', face: 1 } },
        { id: 'twos',   entry: { kind: 'face', face: 2 } },
        { id: 'threes', entry: { kind: 'face', face: 3 } },
        { id: 'fours',  entry: { kind: 'face', face: 4 } },
        { id: 'fives',  entry: { kind: 'face', face: 5 } },
        { id: 'sixes',  entry: { kind: 'face', face: 6 } }
      ]
    },
    {
      id: 'lower',
      labelKey: 'lowerSection',
      categories: [
        { id: 'threeKind',  entry: { kind: 'sum', max: MAX_DICE_SUM, presets: SUM_PRESETS } },
        { id: 'fourKind',   entry: { kind: 'sum', max: MAX_DICE_SUM, presets: SUM_PRESETS } },
        { id: 'fullHouse',  entry: { kind: 'options', options: [{ value: 25 }] } },
        { id: 'smStraight', entry: { kind: 'options', options: [{ value: 30 }] } },
        { id: 'lgStraight', entry: { kind: 'options', options: [{ value: 40 }] } },
        { id: 'yahtzee',    entry: { kind: 'options', options: [{ value: 50 }] } },
        { id: 'chance',     entry: { kind: 'sum', max: MAX_DICE_SUM, presets: SUM_PRESETS } }
      ]
    }
  ],
  extras: [
    {
      id: 'extraYahtzee',
      value: 100,
      sectionId: 'lower',
      titleKey: 'extraTitle',
      descKey: 'extraDesc',
      // Official rule: the bonus is only awarded when the Yahtzee box
      // already holds 50. A scratched (0) or empty box earns nothing.
      requires: (player) => player.scores.yahtzee === 50,
      blockedKey: 'needYahtzeeToast'
    }
  ]
};

export function renderYahtzee(container) {
  mountScorecard(container, yahtzeeDef);
}
