// Generala: a definition for the shared scorecard engine.
//
// Rules implemented (agreed 22–23 Nov 2026):
//   10 boxes — numbers 1 to 6, then Escalera, Full, Póker, Generala,
//   plus Doble Generala.
//   Base values:    Escalera 20 · Full 30 · Póker 40 · Generala 50
//   Servida (made on the first roll, no re-rolls) DOUBLES the value:
//                   Escalera 40 · Full 60 · Póker 80 · Generala 100
//   Generala servida ends the game immediately — that player wins
//   regardless of points on the sheet.
//   Doble Generala is worth 100 and can only be scored once a Generala
//   has already been recorded (50 or 100).
//   There is NO upper-section bonus — that is a Yahtzee rule, not a
//   Generala one.
//
// The app never validates dice: players roll real dice and record the
// outcome, so Escalera variants (1-2-3-4-5 vs 2-3-4-5-6, and whether a
// 1 may close as a 6) do not change anything here. They belong on the
// rules sheet, not in the scoring.

import { mountScorecard } from '../core/scorecard.js';

const strings = {
  es: {
    gameTitle: 'Generala',
    installPrompt: '📲 Instalar Ronda y Punto',
    numbersSection: 'Números',
    gamesSection: 'Juegos',
    optNormal: 'Armada',
    optServida: 'Servida',
    needGeneralaToast: 'Primero hay que anotar una Generala',
    scoreFixed: (pts) => `Anotar ${pts} puntos`,
    inputPlaceholder: (max) => `Puntos (0 - ${max})`,
    categories: {
      ones:   { name: 'Unos',   desc: 'Suma de todos los 1' },
      twos:   { name: 'Doses',  desc: 'Suma de todos los 2' },
      threes: { name: 'Treses', desc: 'Suma de todos los 3' },
      fours:  { name: 'Cuatros', desc: 'Suma de todos los 4' },
      fives:  { name: 'Cincos', desc: 'Suma de todos los 5' },
      sixes:  { name: 'Seises', desc: 'Suma de todos los 6' },
      escalera:      { name: 'Escalera',        desc: '5 dados en secuencia · 20 pts, servida 40' },
      full:          { name: 'Full',            desc: 'Trío + pareja · 30 pts, servida 60' },
      poker:         { name: 'Póker',           desc: '4 dados iguales · 40 pts, servida 80' },
      generala:      { name: 'Generala',        desc: '5 dados iguales · 50 pts, servida 100 y gana' },
      dobleGenerala: { name: 'Doble Generala',  desc: 'Segunda generala · 100 pts' }
    }
  },
  en: {
    gameTitle: 'Generala',
    installPrompt: '📲 Install Ronda y Punto',
    numbersSection: 'Numbers',
    gamesSection: 'Combinations',
    optNormal: 'Built up',
    optServida: 'Servida (first roll)',
    needGeneralaToast: 'Score a Generala first',
    scoreFixed: (pts) => `Score ${pts} points`,
    inputPlaceholder: (max) => `Points (0 - ${max})`,
    categories: {
      ones:   { name: 'Ones',   desc: 'Sum of all 1s' },
      twos:   { name: 'Twos',   desc: 'Sum of all 2s' },
      threes: { name: 'Threes', desc: 'Sum of all 3s' },
      fours:  { name: 'Fours',  desc: 'Sum of all 4s' },
      fives:  { name: 'Fives',  desc: 'Sum of all 5s' },
      sixes:  { name: 'Sixes',  desc: 'Sum of all 6s' },
      escalera:      { name: 'Escalera (straight)', desc: '5 dice in sequence · 20 pts, 40 on first roll' },
      full:          { name: 'Full',                desc: '3 of a kind + pair · 30 pts, 60 on first roll' },
      poker:         { name: 'Póker',               desc: '4 of a kind · 40 pts, 80 on first roll' },
      generala:      { name: 'Generala',            desc: '5 of a kind · 50 pts; 100 on first roll and wins' },
      dobleGenerala: { name: 'Doble Generala',      desc: 'A second generala · 100 pts' }
    }
  }
};

// Base value and its servida (first-roll) double.
const PLAY = (base) => ({
  kind: 'options',
  options: [
    { value: base,     labelKey: 'optNormal' },
    { value: base * 2, labelKey: 'optServida' }
  ]
});

const GENERALA_SERVIDA = 100;

const rules = {
  es: {
    howItWorks: 'Cada turno tiras los cinco dados hasta tres veces, apartando los que quieras entre tirada y tirada. Anotas el resultado en una de las diez casillas. Si logras una jugada en la primera tirada, sin repetir ningún dado, es "servida" y vale el doble. Gana quien más suma al llenar la hoja, salvo que alguien saque una Generala servida: eso termina la partida en el acto.',
    houseRules: [
      'Servida (en la primera tirada, sin repetir dados) vale el doble.',
      'Generala servida gana la partida al instante, aunque otro vaya ganando por puntos.',
      'Doble Generala vale 100 y solo se puede anotar después de haber anotado una Generala.',
      'Una Generala tachada con cero no habilita la Doble Generala.',
      'No hay bono por la sección de números: eso es una regla del Yahtzee, no de la Generala.'
    ],
    note: 'La app no valida los dados, así que la variante de escalera que uséis (1-2-3-4-5 o 2-3-4-5-6, y si el 1 cierra como 6) la acordáis vosotros antes de empezar.'
  },
  en: {
    howItWorks: 'On your turn you roll the five dice up to three times, keeping the ones you want between rolls, then write the result into one of the ten boxes. A hand made on the very first roll, with no dice re-rolled, is "servida" and scores double. Highest total wins once the sheet is full — unless somebody rolls a Generala servida, which ends the game on the spot.',
    houseRules: [
      'Servida (made on the first roll, nothing re-rolled) scores double.',
      'A Generala servida wins outright, even if someone else is ahead on points.',
      'Doble Generala is worth 100 and can only be scored after a Generala has been recorded.',
      'A Generala crossed out for zero does not unlock Doble Generala.',
      'There is no bonus for the numbers section: that is a Yahtzee rule, not a Generala one.'
    ],
    note: 'The app does not check the dice, so agree your Escalera variant before you start (1-2-3-4-5 or 2-3-4-5-6, and whether a 1 may close as a 6).'
  }
};

export const generalaDef = {
  id: 'generala',
  storageKey: 'generala',
  version: 'v0.7',
  titleKey: 'gameTitle',
  maxPlayers: 6,
  playerColors: true,
  strings,
  rules,
  sections: [
    {
      id: 'numbers',
      labelKey: 'numbersSection',
      // Deliberately no bonus: the 63-point upper bonus is Yahtzee's.
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
      id: 'games',
      labelKey: 'gamesSection',
      categories: [
        { id: 'escalera', entry: PLAY(20) },
        { id: 'full',     entry: PLAY(30) },
        { id: 'poker',    entry: PLAY(40) },
        { id: 'generala', entry: PLAY(50) },
        {
          id: 'dobleGenerala',
          entry: { kind: 'options', options: [{ value: 100 }] },
          // Only legal once a Generala is on the sheet (50 or 100).
          requires: (player) => (player.scores.generala || 0) >= 50,
          blockedKey: 'needGeneralaToast'
        }
      ]
    }
  ],
  // A Generala rolled on the first throw wins outright.
  instantWin: (player) => player.scores.generala === GENERALA_SERVIDA
};

export function renderGenerala(container) {
  mountScorecard(container, generalaDef);
}
