// Yahtzee scorekeeper. Module boundary: the whole UI, its state and
// listeners live in here, mounted by renderYahtzee(container).
//
// Behaviour changes in this file vs v0.5.0:
//   BUG 1: separate "whose turn" (turnIndex) from "which player's card is
//          being viewed" (viewIndex). Correcting a past box no longer
//          changes whose turn it is.
//   BUG 2: archiveCurrentGame pushes its undo snapshot BEFORE touching
//          scores or history, and the snapshot now includes history so
//          undoing a save also removes the history entry.
//   BUG 3: free-entry score input is capped at 30 (Yahtzee's max sum).
//   BUG 4: the Extra Yahtzee + button only works when the Yahtzee box
//          holds 50; otherwise it shows a toast instead of adding bonus.
//   BUG 5: when every player has filled all 13 boxes, the standings
//          sheet opens automatically.
//   BUG 6: ties for first place show 🥇 for every tied player, and the
//          history winner line names each one.
//   KNOWN ISSUE: the undo stack is persisted to storage, so undo still
//          works after the app is closed and reopened.

import { loadJSON, saveJSON } from '../core/storage.js';
import { showToast, escapeHtml } from '../core/ui.js';

const STATE_KEY = 'yahtzee.state';
const HISTORY_KEY = 'yahtzee.history';
const UNDO_KEY = 'yahtzee.undo';
const MAX_UNDO = 25;

// ---------- Translations ----------

const I18N = {
  es: {
    langLabel: 'ES 🇪🇸',
    installPrompt: '📲 Instalar Yahtzee como App',
    installBtn: 'Instalar',
    reset: 'Reiniciar',
    activePlayer: 'Jugador activo:',
    viewingNote: (name) => `Viendo a ${name}`,
    rename: 'Renombrar',
    addPlayer: '+ Jugador',
    defaultPlayerPrefix: 'Jugador',
    autoAdvance: 'Avance automático de turno',
    finishGame: '💾 Guardar partida',
    modalFinishGame: '💾 Finalizar y guardar en historial',
    undoBtn: '↩️ Deshacer',
    upperSection: 'Sección Superior',
    upperSubtotal: 'Subtotal Superior',
    bonusRemaining: (n) => `Faltan ${n} pts para bono de +35`,
    bonusReached: '¡Objetivo de 63 pts alcanzado!',
    upperBonus: 'Bono Superior (≥ 63 pts)',
    lowerSection: 'Sección Inferior',
    extraTitle: 'Bono Yahtzee Extra (+100 c/u)',
    extraDesc: 'Por cada Yahtzee adicional tras obtener 50 pts',
    grandTotal: 'Puntuación Total',
    leaderboardBtn: '🏆 Clasificación',
    leaderboardTitle: '🏆 Clasificación de la partida',
    gameOverTitle: '🏁 ¡Partida terminada!',
    historyTitle: '📜 Historial de partidas',
    clearHistory: 'Borrar',
    emptyHistory: 'Aún no hay partidas guardadas en el historial.',
    recordLabel: '👑 Récord histórico:',
    currentLabel: 'Actual',
    emptyLabel: 'vacío',
    scoreFixed: (pts) => `Anotar ${pts} puntos`,
    inputPlaceholder: 'Puntos (0 - 30)',
    save: 'Guardar',
    scratchZero: 'Tachar (0 pts)',
    clearEmpty: 'Dejar vacío',
    maxScoreToast: 'Máximo 30 puntos',
    needYahtzeeToast: 'Primero anota un Yahtzee de 50 pts',
    maxPlayersAlert: 'Máximo 6 jugadores en esta versión.',
    renamePrompt: 'Nuevo nombre para el jugador:',
    deleteConfirm: (name) => `¿Eliminar a "${name}"?`,
    resetConfirm: '¿Reiniciar todas las puntuaciones de la partida actual?',
    finishConfirm: '¿Guardar el resultado actual en el historial y empezar una partida nueva?',
    emptyGameAlert: 'Aún no hay puntos anotados para guardar.',
    clearHistoryConfirm: '¿Borrar todo el historial de partidas guardadas?',
    toastTurn: (name) => `Turno de ${name}`,
    toastUndone: 'Último movimiento deshecho',
    toastSaved: 'Partida guardada en el historial',
    categories: {
      ones: { name: 'Unos (Aces)', desc: 'Suma de todos los 1' },
      twos: { name: 'Doses', desc: 'Suma de todos los 2' },
      threes: { name: 'Treses', desc: 'Suma de todos los 3' },
      fours: { name: 'Cuatros', desc: 'Suma de todos los 4' },
      fives: { name: 'Cincos', desc: 'Suma de todos los 5' },
      sixes: { name: 'Seises', desc: 'Suma de todos los 6' },
      threeKind: { name: 'Trío (3 Iguales)', desc: 'Suma de los 5 dados' },
      fourKind: { name: 'Póker (4 Iguales)', desc: 'Suma de los 5 dados' },
      fullHouse: { name: 'Full House', desc: 'Trío + pareja · 25 pts' },
      smStraight: { name: 'Escalera Menor', desc: '4 dados consecutivos · 30 pts' },
      lgStraight: { name: 'Escalera Mayor', desc: '5 dados consecutivos · 40 pts' },
      yahtzee: { name: 'Yahtzee', desc: '5 dados iguales · 50 pts' },
      chance: { name: 'Suerte (Chance)', desc: 'Suma de los 5 dados' }
    }
  },
  en: {
    langLabel: 'EN 🇺🇸',
    installPrompt: '📲 Install Yahtzee as an App',
    installBtn: 'Install',
    reset: 'Reset',
    activePlayer: 'Active player:',
    viewingNote: (name) => `Viewing ${name}`,
    rename: 'Rename',
    addPlayer: '+ Player',
    defaultPlayerPrefix: 'Player',
    autoAdvance: 'Auto-advance turn',
    finishGame: '💾 Save game',
    modalFinishGame: '💾 Finish & save to history',
    undoBtn: '↩️ Undo',
    upperSection: 'Upper Section',
    upperSubtotal: 'Upper Subtotal',
    bonusRemaining: (n) => `${n} pts needed for +35 bonus`,
    bonusReached: '63 pts bonus target reached!',
    upperBonus: 'Upper Bonus (≥ 63 pts)',
    lowerSection: 'Lower Section',
    extraTitle: 'Extra Yahtzee Bonus (+100 ea)',
    extraDesc: 'For each additional Yahtzee after scoring 50',
    grandTotal: 'Grand Total',
    leaderboardBtn: '🏆 Standings',
    leaderboardTitle: '🏆 Game Standings',
    gameOverTitle: '🏁 Game over!',
    historyTitle: '📜 Match History',
    clearHistory: 'Clear',
    emptyHistory: 'No saved games in history yet.',
    recordLabel: '👑 All-time record:',
    currentLabel: 'Current',
    emptyLabel: 'empty',
    scoreFixed: (pts) => `Score ${pts} points`,
    inputPlaceholder: 'Points (0 - 30)',
    save: 'Save',
    scratchZero: 'Scratch (0 pts)',
    clearEmpty: 'Clear cell',
    maxScoreToast: 'Max 30 points',
    needYahtzeeToast: 'Score a Yahtzee (50) first',
    maxPlayersAlert: 'Maximum 6 players in this version.',
    renamePrompt: 'New name for player:',
    deleteConfirm: (name) => `Remove "${name}"?`,
    resetConfirm: 'Reset all scores for the current game?',
    finishConfirm: 'Save current standings to history and start a fresh game?',
    emptyGameAlert: 'No scores entered yet to save.',
    clearHistoryConfirm: 'Clear all saved match history?',
    toastTurn: (name) => `${name}'s turn`,
    toastUndone: 'Last move undone',
    toastSaved: 'Game saved to history',
    categories: {
      ones: { name: 'Ones (Aces)', desc: 'Sum of all 1s' },
      twos: { name: 'Twos', desc: 'Sum of all 2s' },
      threes: { name: 'Threes', desc: 'Sum of all 3s' },
      fours: { name: 'Fours', desc: 'Sum of all 4s' },
      fives: { name: 'Fives', desc: 'Sum of all 5s' },
      sixes: { name: 'Sixes', desc: 'Sum of all 6s' },
      threeKind: { name: 'Three of a Kind', desc: 'Sum of all 5 dice' },
      fourKind: { name: 'Four of a Kind', desc: 'Sum of all 5 dice' },
      fullHouse: { name: 'Full House', desc: '3 of a kind + pair · 25 pts' },
      smStraight: { name: 'Small Straight', desc: '4 sequential dice · 30 pts' },
      lgStraight: { name: 'Large Straight', desc: '5 sequential dice · 40 pts' },
      yahtzee: { name: 'Yahtzee', desc: '5 of a kind · 50 pts' },
      chance: { name: 'Chance', desc: 'Sum of all 5 dice' }
    }
  }
};

// ---------- Category tables ----------

const UPPER_CATEGORIES = [
  { id: 'ones', face: 1 },
  { id: 'twos', face: 2 },
  { id: 'threes', face: 3 },
  { id: 'fours', face: 4 },
  { id: 'fives', face: 5 },
  { id: 'sixes', face: 6 }
];

const LOWER_CATEGORIES = [
  { id: 'threeKind', type: 'sum' },
  { id: 'fourKind', type: 'sum' },
  { id: 'fullHouse', type: 'fixed', fixed: 25 },
  { id: 'smStraight', type: 'fixed', fixed: 30 },
  { id: 'lgStraight', type: 'fixed', fixed: 40 },
  { id: 'yahtzee', type: 'fixed', fixed: 50 },
  { id: 'chance', type: 'sum' }
];

const ALL_CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];
const SUM_INPUT_MAX = 30;

// ---------- State ----------

let state;
let history;
let undoStack = [];
let editingCategory = null;

function t() { return I18N[state.lang] || I18N.es; }

function createEmptyScores() {
  const scores = {};
  ALL_CATEGORIES.forEach(c => { scores[c.id] = null; });
  return scores;
}

function createPlayer(name) {
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    name,
    scores: createEmptyScores(),
    extraYahtzees: 0
  };
}

function defaultState() {
  return {
    lang: 'es',
    dark: false,
    autoAdvance: true,
    turnIndex: 0,    // whose turn it is (independent of what you're viewing)
    viewIndex: 0,    // whose card is on screen (defaults to turnIndex)
    players: [createPlayer('Jugador 1'), createPlayer('Jugador 2')]
  };
}

function loadState() {
  const parsed = loadJSON(STATE_KEY, null);
  if (!parsed || !Array.isArray(parsed.players) || parsed.players.length === 0) {
    return defaultState();
  }
  // Pre-v0.6 saved states had activeIndex meaning both "turn" and "view".
  // Treat that single value as both for a seamless upgrade.
  const legacyIndex = typeof parsed.activeIndex === 'number' ? parsed.activeIndex : 0;
  const rawTurn = typeof parsed.turnIndex === 'number' ? parsed.turnIndex : legacyIndex;
  const rawView = typeof parsed.viewIndex === 'number' ? parsed.viewIndex : rawTurn;
  const clamp = (n) => Math.min(Math.max(0, n), parsed.players.length - 1);
  return {
    lang: parsed.lang === 'en' ? 'en' : 'es',
    dark: Boolean(parsed.dark),
    autoAdvance: parsed.autoAdvance !== undefined ? Boolean(parsed.autoAdvance) : true,
    turnIndex: clamp(rawTurn),
    viewIndex: clamp(rawView),
    players: parsed.players
  };
}

function saveState() { saveJSON(STATE_KEY, state); }

function loadHistory() {
  const parsed = loadJSON(HISTORY_KEY, []);
  if (!Array.isArray(parsed)) return [];
  // Normalise old entries that only have `winner` (singular) into the
  // new `winners` (array) shape used by tied-winner handling.
  return parsed.map(e => {
    if (e.winners) return e;
    if (e.winner) return { ...e, winners: [e.winner] };
    return e;
  });
}

function saveHistory() { saveJSON(HISTORY_KEY, history); }

function loadUndoStack() {
  const parsed = loadJSON(UNDO_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveUndoStack() { saveJSON(UNDO_KEY, undoStack); }

// Undo snapshots now include history and viewIndex, so undoing a saved
// game also removes the entry it added and restores what the user was
// looking at.
function pushUndoSnapshot() {
  const snapshot = JSON.stringify({
    turnIndex: state.turnIndex,
    viewIndex: state.viewIndex,
    players: state.players,
    history
  });
  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  saveUndoStack();
}

function performUndo() {
  if (undoStack.length === 0) return;
  const prev = JSON.parse(undoStack.pop());
  state.players = prev.players;
  const clamp = (n) => Math.min(Math.max(0, n), state.players.length - 1);
  state.turnIndex = clamp(prev.turnIndex ?? 0);
  state.viewIndex = clamp(prev.viewIndex ?? state.turnIndex);
  if (Array.isArray(prev.history)) {
    history = prev.history;
    saveHistory();
  }
  saveState();
  saveUndoStack();
  render();
  showToast(t().toastUndone);
}

// ---------- Totals ----------

function calcPlayerTotals(player) {
  const upperSum = UPPER_CATEGORIES.reduce((acc, cat) => {
    const val = player.scores[cat.id];
    return acc + (typeof val === 'number' ? val : 0);
  }, 0);
  const upperBonus = upperSum >= 63 ? 35 : 0;
  const lowerSum = LOWER_CATEGORIES.reduce((acc, cat) => {
    const val = player.scores[cat.id];
    return acc + (typeof val === 'number' ? val : 0);
  }, 0);
  const extraBonus = (player.extraYahtzees || 0) * 100;
  const grandTotal = upperSum + upperBonus + lowerSum + extraBonus;
  const upperFilled = UPPER_CATEGORIES.filter(c => player.scores[c.id] !== null).length;
  const lowerFilled = LOWER_CATEGORIES.filter(c => player.scores[c.id] !== null).length;
  return { upperSum, upperBonus, lowerSum, extraBonus, grandTotal, upperFilled, lowerFilled };
}

function cardIsFull(player) {
  return ALL_CATEGORIES.every(c => player.scores[c.id] !== null);
}

function isGameOver() {
  return state.players.length > 0 && state.players.every(cardIsFull);
}

// Rank players for standings using "competition ranking" (1-1-3 on a tie).
// Special case: if nobody has scored yet (everyone's at 0, usually right
// after a reset), fall back to purely positional ranking so the top of
// the sheet still shows 🥇 / 🥈 instead of marking every player as a
// joint winner of nothing.
// Returns [{ name, total, rank }], sorted highest first.
function rankedStandings() {
  const ranked = state.players
    .map(p => ({ name: p.name, total: calcPlayerTotals(p).grandTotal }))
    .sort((a, b) => b.total - a.total);
  const nobodyScored = ranked.length > 0 && ranked[0].total === 0;
  let currentRank = 1;
  ranked.forEach((entry, idx) => {
    if (idx > 0 && entry.total < ranked[idx - 1].total) currentRank = idx + 1;
    entry.rank = nobodyScored ? (idx + 1) : currentRank;
  });
  return ranked;
}

function medalFor(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
}

// ---------- HTML template ----------

const TEMPLATE = `
  <div id="installBanner" class="install-banner">
    <span id="lblInstallPrompt">📲 Instalar Yahtzee como App</span>
    <button id="btnInstallApp" class="primary">Instalar</button>
  </div>

  <div class="app-container">
    <header>
      <div class="top-bar">
        <div class="brand">
          <h1>Yahtzee</h1>
          <span class="badge">v0.6</span>
        </div>
        <div class="actions">
          <button id="btnUndo" title="Deshacer / Undo" disabled>↩️</button>
          <button id="btnHistory" title="Historial / History">📜</button>
          <button id="btnLang" class="lang-btn" title="Idioma / Language">ES 🇪🇸</button>
          <button id="btnTheme" title="Tema / Theme">🌙</button>
          <button id="btnReset" class="danger-outline">Reiniciar</button>
        </div>
      </div>

      <div id="playersBar" class="players-bar"></div>

      <div class="player-controls">
        <div>
          <span id="lblActivePlayer">Jugador activo:</span> <strong id="activePlayerLabel">-</strong>
          <span id="viewingNote" class="row-desc" style="display:none; margin-left:6px;"></span>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="btnRenamePlayer">Renombrar</button>
          <button id="btnAddPlayer">+ Jugador</button>
          <button id="btnRemovePlayer" class="danger-outline">✕</button>
        </div>
      </div>

      <div class="settings-strip">
        <label class="toggle-label">
          <input type="checkbox" id="chkAutoAdvance" />
          <span id="lblAutoAdvance">Avance automático de turno</span>
        </label>
        <button id="btnFinishGame" class="success-btn">💾 Guardar partida</button>
      </div>
    </header>

    <main>
      <section class="section-card">
        <div class="section-header">
          <span id="lblUpperSection">Sección Superior</span>
          <span id="upperCountBadge">0 / 6</span>
        </div>
        <div id="upperRows"></div>
        <div class="summary-row">
          <div>
            <div id="lblUpperSubtotal">Subtotal Superior</div>
            <div class="bonus-progress" id="upperProgressText">Faltan 63 pts para bono de +35</div>
          </div>
          <strong id="upperSubtotalVal">0</strong>
        </div>
        <div class="summary-row">
          <div>
            <div id="lblUpperBonus">Bono Superior (≥ 63 pts)</div>
          </div>
          <strong id="upperBonusVal">0</strong>
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <span id="lblLowerSection">Sección Inferior</span>
          <span id="lowerCountBadge">0 / 7</span>
        </div>
        <div id="lowerRows"></div>
        <div class="extra-yahtzee-box">
          <div>
            <div class="row-title" id="lblExtraTitle">Bono Yahtzee Extra (+100 c/u)</div>
            <div class="row-desc" id="lblExtraDesc">Por cada Yahtzee adicional tras obtener 50 pts</div>
          </div>
          <div class="counter-pill">
            <button id="btnExtraMinus">−</button>
            <strong id="extraYahtzeeCount">0</strong>
            <button id="btnExtraPlus">+</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <div class="total-dock">
    <div class="total-dock-inner">
      <div>
        <div class="grand-total-label" id="lblGrandTotal">Puntuación Total</div>
        <div class="grand-total-value" id="grandTotalVal">0</div>
      </div>
      <div class="dock-actions">
        <button id="btnDockUndo" disabled>↩️ Deshacer</button>
        <button id="btnLeaderboard">🏆 Clasificación</button>
      </div>
    </div>
  </div>

  <div id="scoreModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-sheet">
      <div class="modal-header">
        <div>
          <h2 id="modalTitle">Jugada</h2>
          <div class="row-desc" id="modalSubtitle">Selecciona puntuación</div>
        </div>
        <button id="btnCloseModal">✕</button>
      </div>
      <div id="modalBody"></div>
      <div class="modal-footer-actions">
        <button id="btnZeroScore" class="danger-outline">Tachar (0 pts)</button>
        <button id="btnClearScore">Dejar vacío</button>
      </div>
    </div>
  </div>

  <div id="leaderboardModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-sheet">
      <div class="modal-header">
        <h2 id="lblLeaderboardTitle">🏆 Clasificación de la partida</h2>
        <button id="btnCloseLeaderboard">✕</button>
      </div>
      <div id="leaderboardList"></div>
      <div style="margin-top: 12px;">
        <button id="btnModalFinishGame" class="primary" style="width:100%; padding:12px;">💾 Finalizar y guardar en historial</button>
      </div>
    </div>
  </div>

  <div id="historyModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-sheet">
      <div class="modal-header">
        <h2 id="lblHistoryTitle">📜 Historial de partidas</h2>
        <div style="display:flex; gap:6px;">
          <button id="btnClearHistory" class="danger-outline">Borrar</button>
          <button id="btnCloseHistory">✕</button>
        </div>
      </div>
      <div id="recordBanner" class="record-banner" style="display:none;"></div>
      <div id="historyList"></div>
    </div>
  </div>
`;

// ---------- Render ----------

function render() {
  const dict = t();
  document.documentElement.lang = state.lang;
  document.body.classList.toggle('dark', state.dark);

  document.getElementById('lblInstallPrompt').textContent = dict.installPrompt;
  document.getElementById('btnInstallApp').textContent = dict.installBtn;
  document.getElementById('btnLang').textContent = dict.langLabel;
  document.getElementById('btnTheme').textContent = state.dark ? '☀️' : '🌙';
  document.getElementById('btnReset').textContent = dict.reset;
  document.getElementById('lblActivePlayer').textContent = dict.activePlayer;
  document.getElementById('btnRenamePlayer').textContent = dict.rename;
  document.getElementById('btnAddPlayer').textContent = dict.addPlayer;
  document.getElementById('chkAutoAdvance').checked = state.autoAdvance;
  document.getElementById('lblAutoAdvance').textContent = dict.autoAdvance;
  document.getElementById('btnFinishGame').textContent = dict.finishGame;
  document.getElementById('btnModalFinishGame').textContent = dict.modalFinishGame;
  document.getElementById('btnDockUndo').textContent = dict.undoBtn;

  const canUndo = undoStack.length > 0;
  document.getElementById('btnUndo').disabled = !canUndo;
  document.getElementById('btnDockUndo').disabled = !canUndo;

  document.getElementById('lblUpperSection').textContent = dict.upperSection;
  document.getElementById('lblUpperSubtotal').textContent = dict.upperSubtotal;
  document.getElementById('lblUpperBonus').textContent = dict.upperBonus;
  document.getElementById('lblLowerSection').textContent = dict.lowerSection;
  document.getElementById('lblExtraTitle').textContent = dict.extraTitle;
  document.getElementById('lblExtraDesc').textContent = dict.extraDesc;
  document.getElementById('lblGrandTotal').textContent = dict.grandTotal;
  document.getElementById('btnLeaderboard').textContent = dict.leaderboardBtn;
  document.getElementById('lblHistoryTitle').textContent = dict.historyTitle;
  document.getElementById('btnClearHistory').textContent = dict.clearHistory;
  document.getElementById('btnZeroScore').textContent = dict.scratchZero;
  document.getElementById('btnClearScore').textContent = dict.clearEmpty;

  // Label shows whose TURN it is. If the user is looking at someone
  // else's card, add a small "Viewing X" hint next to the label.
  const turnPlayer = state.players[state.turnIndex];
  const viewPlayer = state.players[state.viewIndex];
  document.getElementById('activePlayerLabel').textContent = turnPlayer.name;
  const viewingNote = document.getElementById('viewingNote');
  if (state.viewIndex !== state.turnIndex) {
    viewingNote.textContent = dict.viewingNote(viewPlayer.name);
    viewingNote.style.display = '';
  } else {
    viewingNote.textContent = '';
    viewingNote.style.display = 'none';
  }
  document.getElementById('btnRemovePlayer').disabled = state.players.length <= 1;

  const playersBar = document.getElementById('playersBar');
  playersBar.innerHTML = '';
  state.players.forEach((p, idx) => {
    const totals = calcPlayerTotals(p);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'player-tab' + (idx === state.viewIndex ? ' active' : '');
    tab.innerHTML = `
      <span class="p-name">${escapeHtml(p.name)}</span>
      <span class="p-score">${totals.grandTotal}</span>
    `;
    tab.addEventListener('click', () => {
      state.viewIndex = idx;
      saveState();
      render();
    });
    playersBar.appendChild(tab);
  });

  const upperRows = document.getElementById('upperRows');
  upperRows.innerHTML = '';
  UPPER_CATEGORIES.forEach(cat => {
    upperRows.appendChild(buildCategoryRow(cat, viewPlayer.scores[cat.id]));
  });

  const totals = calcPlayerTotals(viewPlayer);
  document.getElementById('upperCountBadge').textContent = `${totals.upperFilled} / 6`;
  document.getElementById('upperSubtotalVal').textContent = totals.upperSum;

  const missingForBonus = Math.max(0, 63 - totals.upperSum);
  const progEl = document.getElementById('upperProgressText');
  progEl.textContent = totals.upperSum >= 63 ? dict.bonusReached : dict.bonusRemaining(missingForBonus);

  const bonusEl = document.getElementById('upperBonusVal');
  bonusEl.textContent = totals.upperBonus > 0 ? `+${totals.upperBonus}` : '0';
  bonusEl.className = totals.upperBonus > 0 ? 'bonus-achieved' : '';

  const lowerRows = document.getElementById('lowerRows');
  lowerRows.innerHTML = '';
  LOWER_CATEGORIES.forEach(cat => {
    lowerRows.appendChild(buildCategoryRow(cat, viewPlayer.scores[cat.id]));
  });

  document.getElementById('lowerCountBadge').textContent = `${totals.lowerFilled} / 7`;
  document.getElementById('extraYahtzeeCount').textContent = viewPlayer.extraYahtzees || 0;
  document.getElementById('grandTotalVal').textContent = totals.grandTotal;
}

function buildCategoryRow(cat, val) {
  const dict = t();
  const catText = dict.categories[cat.id];
  const row = document.createElement('div');
  row.className = 'row-item';

  let badgeClass = 'row-score';
  let badgeText = '—';

  if (typeof val === 'number') {
    if (val === 0) { badgeClass += ' zeroed'; badgeText = '0'; }
    else           { badgeClass += ' filled'; badgeText = String(val); }
  }

  row.innerHTML = `
    <div class="row-info">
      <div class="row-title">${escapeHtml(catText.name)}</div>
      <div class="row-desc">${escapeHtml(catText.desc)}</div>
    </div>
    <div class="${badgeClass}">${badgeText}</div>
  `;
  row.addEventListener('click', () => openScoreModal(cat));
  return row;
}

function openScoreModal(cat) {
  const dict = t();
  const catText = dict.categories[cat.id];
  editingCategory = cat;
  const player = state.players[state.viewIndex];
  const currentVal = player.scores[cat.id];

  document.getElementById('modalTitle').textContent = catText.name;
  document.getElementById('modalSubtitle').textContent =
    `${player.name} · ${dict.currentLabel}: ${currentVal === null ? dict.emptyLabel : currentVal + ' pts'}`;

  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  if (cat.face) {
    const grid = document.createElement('div');
    grid.className = 'dice-grid';
    for (let count = 0; count <= 5; count++) {
      const pts = count * cat.face;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'die-btn' + (currentVal === pts && currentVal !== null ? ' primary' : '');
      btn.innerHTML = `<span class="count">${count}d</span><span class="pts">${pts}p</span>`;
      btn.addEventListener('click', () => setCategoryScore(cat.id, pts));
      grid.appendChild(btn);
    }
    body.appendChild(grid);
  } else if (cat.type === 'fixed') {
    const wrap = document.createElement('div');
    wrap.className = 'quick-options';
    const btnFixed = document.createElement('button');
    btnFixed.type = 'button';
    btnFixed.className = 'primary';
    btnFixed.style.gridColumn = '1 / -1';
    btnFixed.style.padding = '14px';
    btnFixed.style.fontSize = '1rem';
    btnFixed.textContent = dict.scoreFixed(cat.fixed);
    btnFixed.addEventListener('click', () => setCategoryScore(cat.id, cat.fixed));
    wrap.appendChild(btnFixed);
    body.appendChild(wrap);
  } else {
    const inputRow = document.createElement('div');
    inputRow.className = 'custom-input-row';
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = '0';
    numInput.max = String(SUM_INPUT_MAX);
    numInput.placeholder = dict.inputPlaceholder;
    numInput.value = typeof currentVal === 'number' ? currentVal : '';

    const btnApply = document.createElement('button');
    btnApply.type = 'button';
    btnApply.className = 'primary';
    btnApply.textContent = dict.save;
    btnApply.addEventListener('click', () => {
      const parsed = parseInt(numInput.value, 10);
      if (Number.isNaN(parsed) || parsed < 0) return;
      if (parsed > SUM_INPUT_MAX) { showToast(t().maxScoreToast); return; }
      setCategoryScore(cat.id, parsed);
    });

    inputRow.appendChild(numInput);
    inputRow.appendChild(btnApply);
    body.appendChild(inputRow);

    const presets = [10, 15, 18, 20, 22, 24, 25, 28, 30];
    const pad = document.createElement('div');
    pad.className = 'numpad';
    presets.forEach(val => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${val} pts`;
      b.addEventListener('click', () => setCategoryScore(cat.id, val));
      pad.appendChild(b);
    });
    body.appendChild(pad);
  }

  document.getElementById('scoreModal').classList.add('open');
}

function closeScoreModal() {
  editingCategory = null;
  document.getElementById('scoreModal').classList.remove('open');
}

// Scoring writes to the player currently being viewed. The turn only
// advances when the viewer IS the player whose turn it is, which is
// almost always — the exception is correcting a past player's box.
function setCategoryScore(catId, value) {
  pushUndoSnapshot();
  const scoringForOwnTurn = state.viewIndex === state.turnIndex;
  const player = state.players[state.viewIndex];
  player.scores[catId] = value;

  let advancedToName = null;
  if (value !== null && scoringForOwnTurn && state.autoAdvance && state.players.length > 1) {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    state.viewIndex = state.turnIndex;
    advancedToName = state.players[state.turnIndex].name;
  }

  saveState();
  closeScoreModal();
  render();

  if (advancedToName) showToast(t().toastTurn(advancedToName));
  if (isGameOver()) openLeaderboard({ gameOver: true });
}

function openLeaderboard({ gameOver = false } = {}) {
  const dict = t();
  document.getElementById('lblLeaderboardTitle').textContent =
    gameOver ? dict.gameOverTitle : dict.leaderboardTitle;

  const list = document.getElementById('leaderboardList');
  list.innerHTML = '';
  const ranked = rankedStandings();
  ranked.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'leaderboard-item';
    div.innerHTML = `<span>${medalFor(entry.rank)} ${escapeHtml(entry.name)}</span><span>${entry.total} pts</span>`;
    list.appendChild(div);
  });
  document.getElementById('leaderboardModal').classList.add('open');
}

function archiveCurrentGame() {
  const dict = t();
  const ranked = rankedStandings();

  const hasAnyPoints = state.players.some(p =>
    Object.values(p.scores).some(v => v !== null) || (p.extraYahtzees || 0) > 0
  );
  if (!hasAnyPoints) { alert(dict.emptyGameAlert); return; }
  if (!confirm(dict.finishConfirm)) return;

  // Snapshot FIRST, so undoing restores both the scores and removes
  // the entry we're about to add to history (fix for bug 2).
  pushUndoSnapshot();

  const winners = ranked.filter(r => r.rank === 1);
  const entry = {
    id: 'g_' + Date.now(),
    date: new Date().toLocaleDateString(state.lang === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }),
    winner: winners[0],        // kept for backward compatibility
    winners,                   // all tied for first (new)
    standings: ranked
  };
  history.unshift(entry);
  if (history.length > 50) history.pop();
  saveHistory();

  state.players = state.players.map(p => ({
    ...p, scores: createEmptyScores(), extraYahtzees: 0
  }));
  state.turnIndex = 0;
  state.viewIndex = 0;
  saveState();

  document.getElementById('leaderboardModal').classList.remove('open');
  render();
  showToast(dict.toastSaved);
}

function openHistoryModal() {
  const dict = t();
  const list = document.getElementById('historyList');
  const recordBanner = document.getElementById('recordBanner');
  list.innerHTML = '';

  if (history.length === 0) {
    recordBanner.style.display = 'none';
    list.innerHTML = `<div class="empty-state">${dict.emptyHistory}</div>`;
  } else {
    let best = { name: '-', total: -1 };
    history.forEach(g => {
      const topWinner = (g.winners && g.winners[0]) || g.winner;
      if (topWinner && topWinner.total > best.total) best = topWinner;
    });
    recordBanner.style.display = 'flex';
    recordBanner.innerHTML = `<span>${dict.recordLabel} ${escapeHtml(best.name)}</span><span>${best.total} pts</span>`;

    history.forEach(g => {
      const card = document.createElement('div');
      card.className = 'history-card';
      const standings = g.standings || [];
      const winners = g.winners || (g.winner ? [g.winner] : []);
      const winnerNames = winners.map(w => escapeHtml(w.name)).join(' & ');
      const winnerScore = winners.length > 0 ? winners[0].total : '';

      const chips = standings
        .map((s, idx) => {
          const rank = typeof s.rank === 'number' ? s.rank : idx + 1;
          return `<span class="history-chip">${medalFor(rank)} ${escapeHtml(s.name)}: ${s.total}</span>`;
        })
        .join('');
      card.innerHTML = `
        <div class="history-card-top">
          <span>${escapeHtml(g.date)}</span>
          <span>${standings.length} ${state.lang === 'es' ? 'jug.' : 'players'}</span>
        </div>
        <div class="history-winner">🏆 ${winnerNames} — ${winnerScore} pts</div>
        <div class="history-players">${chips}</div>
      `;
      list.appendChild(card);
    });
  }

  document.getElementById('historyModal').classList.add('open');
}

// ---------- Mount ----------

export function renderYahtzee(container) {
  container.innerHTML = TEMPLATE;

  state = loadState();
  history = loadHistory();
  undoStack = loadUndoStack();     // persisted across reloads
  editingCategory = null;

  // Install prompt: the shell owns the deferred event; we wire the
  // button here. Dynamic import avoids a cycle with main.js.
  import('../main.js').then(({ installPromptAvailable, triggerInstallPrompt }) => {
    const btn = document.getElementById('btnInstallApp');
    if (btn) btn.addEventListener('click', async () => {
      if (!installPromptAvailable()) return;
      await triggerInstallPrompt();
      document.getElementById('installBanner').classList.remove('visible');
    });
  });

  document.getElementById('btnUndo').addEventListener('click', performUndo);
  document.getElementById('btnDockUndo').addEventListener('click', performUndo);

  document.getElementById('chkAutoAdvance').addEventListener('change', (e) => {
    state.autoAdvance = e.target.checked;
    saveState();
  });

  document.getElementById('btnFinishGame').addEventListener('click', archiveCurrentGame);
  document.getElementById('btnModalFinishGame').addEventListener('click', archiveCurrentGame);

  document.getElementById('btnHistory').addEventListener('click', openHistoryModal);
  document.getElementById('btnCloseHistory').addEventListener('click', () => {
    document.getElementById('historyModal').classList.remove('open');
  });
  document.getElementById('historyModal').addEventListener('click', e => {
    if (e.target.id === 'historyModal') document.getElementById('historyModal').classList.remove('open');
  });
  document.getElementById('btnClearHistory').addEventListener('click', () => {
    if (history.length === 0) return;
    if (!confirm(t().clearHistoryConfirm)) return;
    history = [];
    saveHistory();
    openHistoryModal();
  });

  document.getElementById('btnLang').addEventListener('click', () => {
    const oldPrefix = state.lang === 'es' ? 'Jugador ' : 'Player ';
    state.lang = state.lang === 'es' ? 'en' : 'es';
    const newPrefix = state.lang === 'es' ? 'Jugador ' : 'Player ';
    state.players.forEach(p => {
      if (p.name.startsWith(oldPrefix)) {
        const suffix = p.name.slice(oldPrefix.length);
        if (/^\d+$/.test(suffix)) p.name = newPrefix + suffix;
      }
    });
    saveState();
    render();
  });

  document.getElementById('btnTheme').addEventListener('click', () => {
    state.dark = !state.dark;
    saveState();
    render();
  });

  document.getElementById('btnAddPlayer').addEventListener('click', () => {
    const dict = t();
    if (state.players.length >= 6) { alert(dict.maxPlayersAlert); return; }
    pushUndoSnapshot();
    const nextNum = state.players.length + 1;
    state.players.push(createPlayer(`${dict.defaultPlayerPrefix} ${nextNum}`));
    // New player becomes the active one (matches v0.5 behaviour).
    state.turnIndex = state.players.length - 1;
    state.viewIndex = state.turnIndex;
    saveState();
    render();
  });

  document.getElementById('btnRenamePlayer').addEventListener('click', () => {
    const dict = t();
    const current = state.players[state.viewIndex];
    const nuevo = prompt(dict.renamePrompt, current.name);
    if (nuevo && nuevo.trim()) {
      pushUndoSnapshot();
      current.name = nuevo.trim().slice(0, 18);
      saveState();
      render();
    }
  });

  document.getElementById('btnRemovePlayer').addEventListener('click', () => {
    const dict = t();
    if (state.players.length <= 1) return;
    const current = state.players[state.viewIndex];
    if (!confirm(dict.deleteConfirm(current.name))) return;
    pushUndoSnapshot();
    const removed = state.viewIndex;
    state.players.splice(removed, 1);
    // Keep turnIndex pointing at the same player when possible.
    if (state.turnIndex > removed) state.turnIndex -= 1;
    else if (state.turnIndex === removed) state.turnIndex = Math.max(0, state.turnIndex - 1);
    state.viewIndex = Math.max(0, Math.min(removed, state.players.length - 1));
    state.turnIndex = Math.max(0, Math.min(state.turnIndex, state.players.length - 1));
    saveState();
    render();
  });

  document.getElementById('btnExtraMinus').addEventListener('click', () => {
    const p = state.players[state.viewIndex];
    if ((p.extraYahtzees || 0) <= 0) return;
    pushUndoSnapshot();
    p.extraYahtzees = Math.max(0, (p.extraYahtzees || 0) - 1);
    saveState();
    render();
  });

  document.getElementById('btnExtraPlus').addEventListener('click', () => {
    const p = state.players[state.viewIndex];
    // Bonus is only awarded when the Yahtzee box holds 50. If it's
    // empty, scratched or any other value, the tap shows a hint toast
    // and leaves the counter alone.
    if (p.scores.yahtzee !== 50) { showToast(t().needYahtzeeToast); return; }
    pushUndoSnapshot();
    p.extraYahtzees = (p.extraYahtzees || 0) + 1;
    saveState();
    render();
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    const dict = t();
    if (!confirm(dict.resetConfirm)) return;
    pushUndoSnapshot();
    state.players = state.players.map(p => ({
      ...p, scores: createEmptyScores(), extraYahtzees: 0
    }));
    state.turnIndex = 0;
    state.viewIndex = 0;
    saveState();
    render();
  });

  document.getElementById('btnCloseModal').addEventListener('click', closeScoreModal);
  document.getElementById('scoreModal').addEventListener('click', e => {
    if (e.target.id === 'scoreModal') closeScoreModal();
  });

  document.getElementById('btnZeroScore').addEventListener('click', () => {
    if (editingCategory) setCategoryScore(editingCategory.id, 0);
  });
  document.getElementById('btnClearScore').addEventListener('click', () => {
    if (editingCategory) setCategoryScore(editingCategory.id, null);
  });

  document.getElementById('btnLeaderboard').addEventListener('click', () => openLeaderboard());
  document.getElementById('btnCloseLeaderboard').addEventListener('click', () => {
    document.getElementById('leaderboardModal').classList.remove('open');
  });
  document.getElementById('leaderboardModal').addEventListener('click', e => {
    if (e.target.id === 'leaderboardModal') document.getElementById('leaderboardModal').classList.remove('open');
  });

  render();
}
