// Reusable engine for games scored as a running total per side, where
// each turn adds an amount and the first side to reach a target wins
// (Farkle, Truco, and later Chinchón / Gin Rummy).
//
// It is the sibling of core/scorecard.js: same chrome, same persistence
// and undo conventions, different scoring shape. A scorecard game fills
// a fixed grid of boxes once each; a running-total game accumulates.
//
// ---------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------
// {
//   id, storageKey, version, titleKey,
//   strings:   { es: {...}, en: {...} },   // merged over core/i18n COMMON
//   target:    10000,                      // reach this to win
//   minSides:  2, maxSides: 8,
//   sideKind:  'player' | 'team',          // wording for the roster
//   defaultSideCount: 2,
//
//   // Two-phase (Farkle): build a pending amount, then commit it with an
//   // action. One-phase (Truco): every add commits immediately.
//   twoPhase:  true,
//
//   entry: {
//     presets:    [50, 100, 200, 300, 500, 1000],
//     allowTyped: true,
//     max:        10000
//   },
//
//   // Buttons shown under the entry pad. Each gets the engine's `api`
//   // and returns nothing; it mutates through the api's helpers.
//   actions: [{ id, labelKey, className, run(api) }],
//
//   // Optional: render a side's total as something other than a numeral
//   // (Truco draws toothpicks). Returns an HTML string.
//   renderTotal:  (total, def, dict) => string,
//
//   // Optional: a line crossed partway to the target (Truco's malas ->
//   // buenas at 15).
//   milestone:    { at: 15, labelKey: 'buenas' },
//
//   // Optional: refuse a commit, e.g. Farkle's opening minimum.
//   // Return null to allow, or a dict key to show as a toast.
//   validateCommit: (side, amount, dict) => string | null,
//
//   // Optional: run after every committed turn (Farkle's 3-farkle
//   // penalty lives here).
//   afterCommit:  (side, entry, api) => void
// }
// ---------------------------------------------------------------------

import { loadJSON, saveJSON } from './storage.js';
import { showToast, escapeHtml } from './ui.js';
import { mergeStrings, LANG_LABEL } from './i18n.js';
import { APP_VERSION } from './config.js';
import { mountRules, RULES_MODAL_HTML } from './rules.js';
import { SAVE_MODAL_HTML } from './ui.js';
import { rankPlayers, medalFor } from './standings.js';
import { defaultColorFor, isValidColor, firstFreeColor, colorSwatchesHtml, applyPlayerColor } from './colors.js';

const MAX_UNDO = 25;

export function mountRunningTotal(container, def) {
  const STRINGS = mergeStrings(def.strings);
  const STATE_KEY = `${def.storageKey}.state`;
  const HISTORY_KEY = `${def.storageKey}.history`;
  const UNDO_KEY = `${def.storageKey}.undo`;
  const MIN_SIDES = def.minSides || 2;
  const MAX_SIDES = def.maxSides || 8;
  const TWO_PHASE = Boolean(def.twoPhase);

  let state, history, undoStack;

  const t = () => STRINGS[state.lang] || STRINGS.es;

  // ---------- State ----------
  // A side's turns are kept as a log, not just a total, so the sheet can
  // show what happened and undo can step back one turn at a time.

  function createSide(name, color) {
    return {
      id: 's_' + Math.random().toString(36).slice(2, 9),
      name,
      color: color || defaultColorFor(0),
      turns: []   // [{ amount, kind: 'score' | <action id>, at }]
    };
  }

  function defaultState() {
    const dict = STRINGS.es;
    const count = def.defaultSideCount || MIN_SIDES;
    // A game may name its sides outright — Truco's two sides are
    // "Nosotros" and "Ellos", not "Team 1" and "Team 2".
    const named = def.defaultSideNames ? def.defaultSideNames(dict) : null;
    const prefix = dict[def.sideKind === 'team' ? 'defaultTeamPrefix' : 'defaultPlayerPrefix'];
    const sides = [];
    for (let i = 0; i < count; i++) {
      sides.push(createSide((named && named[i]) || `${prefix} ${i + 1}`, defaultColorFor(i)));
    }
    return {
      lang: 'es',
      dark: false,
      turnIndex: 0,
      pending: 0,
      target: def.target,
      winnerId: null,
      // Turns still owed once someone has passed the target. null until
      // the final round is triggered; only used when def.finalRound.
      finalRoundLeft: null,
      sides
    };
  }

  function normaliseSide(s, index = 0) {
    return {
      id: (s && s.id) || 's_' + Math.random().toString(36).slice(2, 9),
      name: (s && typeof s.name === 'string' && s.name) || 'Jugador',
      color: (s && isValidColor(s.color)) ? s.color : defaultColorFor(index),
      turns: Array.isArray(s && s.turns)
        ? s.turns.filter(x => x && typeof x.amount === 'number')
        : []
    };
  }

  function loadState() {
    const parsed = loadJSON(STATE_KEY, null);
    if (!parsed || !Array.isArray(parsed.sides) || parsed.sides.length === 0) {
      return defaultState();
    }
    const sides = parsed.sides.map((x, i) => normaliseSide(x, i));
    return {
      lang: parsed.lang === 'en' ? 'en' : 'es',
      dark: Boolean(parsed.dark),
      turnIndex: Math.min(Math.max(0, parsed.turnIndex || 0), sides.length - 1),
      pending: typeof parsed.pending === 'number' ? parsed.pending : 0,
      target: typeof parsed.target === 'number' ? parsed.target : def.target,
      winnerId: parsed.winnerId || null,
      finalRoundLeft: typeof parsed.finalRoundLeft === 'number' ? parsed.finalRoundLeft : null,
      sides
    };
  }

  const saveState = () => saveJSON(STATE_KEY, state);

  function loadHistory() {
    const parsed = loadJSON(HISTORY_KEY, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(e => (e.winners ? e : (e.winner ? { ...e, winners: [e.winner] } : e)));
  }

  const saveHistory = () => saveJSON(HISTORY_KEY, history);
  const saveUndoStack = () => saveJSON(UNDO_KEY, undoStack);

  function pushUndoSnapshot() {
    undoStack.push(JSON.stringify({
      turnIndex: state.turnIndex,
      pending: state.pending,
      winnerId: state.winnerId,
      finalRoundLeft: state.finalRoundLeft,
      sides: state.sides,
      history
    }));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    saveUndoStack();
  }

  function performUndo() {
    if (undoStack.length === 0) return;
    const prev = JSON.parse(undoStack.pop());
    state.sides = prev.sides.map((x, i) => normaliseSide(x, i));
    state.turnIndex = Math.min(Math.max(0, prev.turnIndex ?? 0), state.sides.length - 1);
    state.pending = prev.pending ?? 0;
    state.winnerId = prev.winnerId ?? null;
    state.finalRoundLeft = prev.finalRoundLeft ?? null;
    if (Array.isArray(prev.history)) { history = prev.history; saveHistory(); }
    saveState();
    saveUndoStack();
    render();
    showToast(t().toastUndone);
  }

  // ---------- Totals ----------

  const totalOf = (side) => side.turns.reduce((a, x) => a + x.amount, 0);
  const current = () => state.sides[state.turnIndex];
  const leaderTotal = () => Math.max(0, ...state.sides.map(totalOf));
  const someoneReachedTarget = () => state.sides.some(s => totalOf(s) >= state.target);

  // With a final round, passing the target does not end the game — every
  // other side gets one more turn to overtake. Without one, the first
  // side to the target ends it immediately.
  const isGameOver = () => {
    if (state.winnerId) return true;
    if (def.finalRound) return state.finalRoundLeft !== null && state.finalRoundLeft <= 0;
    return someoneReachedTarget();
  };

  function standings() {
    return rankPlayers(state.sides.map(s => ({ id: s.id, name: s.name, total: totalOf(s) })));
  }

  // Consecutive turns at the end of a side's log matching a kind. Farkle
  // uses this for the three-farkles-in-a-row penalty.
  function trailingRun(side, kind) {
    let n = 0;
    for (let i = side.turns.length - 1; i >= 0; i--) {
      if (side.turns[i].kind === kind) n++; else break;
    }
    return n;
  }

  // ---------- The api handed to a game's actions ----------

  const api = {
    get dict() { return t(); },
    get state() { return state; },
    get side() { return current(); },
    totalOf,
    trailingRun,
    target: () => state.target,
    // Record a turn for the current side and move on.
    commit(amount, kind = 'score') {
      const side = current();
      const check = def.validateCommit ? def.validateCommit(side, amount, t(), api) : null;
      if (check) { showToast(t()[check] || check); return false; }
      pushUndoSnapshot();
      const entry = { amount, kind, at: Date.now() };
      side.turns.push(entry);
      state.pending = 0;
      if (def.afterCommit) def.afterCommit(side, entry, api);
      advance();
      return true;
    },
    // Add a correction to a side without taking a turn (penalties).
    adjust(side, amount, kind) {
      side.turns.push({ amount, kind, at: Date.now() });
    },
    toast(key) { showToast(t()[key] || key); }
  };

  function finish() {
    saveState();
    render();
    openLeaderboard();
  }

  function advance() {
    const justPlayed = current();
    let finalRoundJustStarted = false;

    if (def.finalRound) {
      if (state.finalRoundLeft === null && totalOf(justPlayed) >= state.target) {
        // Everyone else gets exactly one more turn to overtake.
        state.finalRoundLeft = state.sides.length - 1;
        finalRoundJustStarted = true;
      } else if (state.finalRoundLeft !== null) {
        state.finalRoundLeft -= 1;
      }
      if (state.finalRoundLeft !== null && state.finalRoundLeft <= 0) { finish(); return; }
    } else if (someoneReachedTarget()) {
      finish();
      return;
    }

    // Farkle passes the dice after every turn. Truco does not: a hand
    // resolves in favour of one side, you record it, and the side you're
    // scoring for stays selected.
    if (def.rotateAfterCommit === false) {
      saveState();
      render();
      return;
    }

    state.turnIndex = (state.turnIndex + 1) % state.sides.length;
    saveState();
    render();
    showToast(finalRoundJustStarted
      ? t().finalRoundToast(justPlayed.name)
      : t().toastTurn(current().name));
  }

  // ---------- Template ----------

  const presetHtml = (def.entry.presets || []).map(v =>
    `<button type="button" class="preset-chip" data-add="${v}">+${v}</button>`
  ).join('');

  const actionHtml = (def.actions || []).map(a =>
    `<button type="button" id="action-${a.id}" class="${a.className || ''} action-btn"></button>`
  ).join('');

  const TEMPLATE = `
    <div id="installBanner" class="install-banner">
      <span id="lblInstallPrompt"></span>
      <button id="btnInstallApp" class="primary"></button>
    </div>

    <div class="app-container">
      <header>
        <div class="top-bar">
          <div class="brand">
            <h1 id="gameTitle"></h1>
            <span class="badge" id="appVersion">v${escapeHtml(APP_VERSION)}</span>
          </div>
          <div class="actions">
            <button id="btnHome" title="Inicio / Home">🏠</button>
            <button id="btnRules" title="Reglas / Rules">📖</button>
            <button id="btnHistory" title="Historial / History">📜</button>
            <button id="btnLang" class="lang-btn" title="Idioma / Language"></button>
            <button id="btnTheme" title="Tema / Theme">🌙</button>
            <button id="btnReset" class="danger-outline"></button>
          </div>
        </div>

        <div class="player-controls">
          <div>
            <span id="lblActivePlayer"></span> <strong id="activePlayerLabel">-</strong>
          </div>
          <div style="display:flex; gap:6px;">
            <button id="btnRenamePlayer"></button>
            <button id="btnAddPlayer"></button>
            <button id="btnRemovePlayer" class="danger-outline" aria-label="✕">✕</button>
          </div>
        </div>

        <div class="settings-strip">
          <span id="targetLabel" class="row-desc"></span>
          <button id="btnFinishGame" class="success-btn"></button>
        </div>
      </header>

      <main>
        <section class="section-card">
          <div class="section-header"><span id="lblSides"></span><span id="lblTarget"></span></div>
          <div id="sidesList"></div>
        </section>

        <section class="section-card entry-card">
          <div class="section-header"><span id="lblEntry"></span></div>
          <div class="entry-body">
            ${TWO_PHASE ? `
              <div class="pending-box">
                <div class="pending-label" id="lblPending"></div>
                <div class="pending-value" id="pendingVal">0</div>
              </div>` : ''}
            <div class="preset-grid" id="presetGrid">${presetHtml}</div>
            ${def.entry.allowTyped ? `
              <div class="custom-input-row">
                <input type="number" id="typedAmount" min="0" max="${def.entry.max}" />
                <button type="button" id="btnAddTyped" class="primary"></button>
              </div>` : ''}
            <div class="action-row">${actionHtml}</div>
          </div>
        </section>
      </main>
    </div>

    <div class="total-dock">
      <div class="total-dock-inner">
        <div>
          <div class="grand-total-label" id="lblGrandTotal"></div>
          <div class="grand-total-value" id="grandTotalVal">0</div>
        </div>
        <div class="dock-actions">
          <button id="btnDockUndo" disabled></button>
          <button id="btnLeaderboard"></button>
        </div>
      </div>
    </div>

    ${RULES_MODAL_HTML}
    ${SAVE_MODAL_HTML}

    <div id="playerModal" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2 id="lblPlayerModalTitle"></h2>
          <button id="btnClosePlayerModal" aria-label="✕">✕</button>
        </div>
        <div class="field-label" id="lblNameField"></div>
        <input type="text" id="playerNameInput" maxlength="18" />
        <div id="colorFields">
          <div class="field-label" id="lblColorField" style="margin-top:14px"></div>
          <div class="color-row" id="colorRow"></div>
        </div>
        <button id="btnSavePlayer" class="primary" style="width:100%; padding:13px"></button>
      </div>
    </div>

    <div id="leaderboardModal" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2 id="lblLeaderboardTitle"></h2>
          <button id="btnCloseLeaderboard" aria-label="✕">✕</button>
        </div>
        <div id="leaderboardList"></div>
        <div style="margin-top: 12px;">
          <button id="btnModalFinishGame" class="primary" style="width:100%; padding:12px;"></button>
        </div>
      </div>
    </div>

    <div id="historyModal" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2 id="lblHistoryTitle"></h2>
          <div style="display:flex; gap:6px;">
            <button id="btnClearHistory" class="danger-outline"></button>
            <button id="btnCloseHistory" aria-label="✕">✕</button>
          </div>
        </div>
        <div id="recordBanner" class="record-banner" style="display:none;"></div>
        <div id="historyList"></div>
      </div>
    </div>
  `;

  // ---------- Render ----------

  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

  function render() {
    const dict = t();
    document.documentElement.lang = state.lang;
    document.body.classList.toggle('dark', state.dark);

    setText('gameTitle', dict[def.titleKey] || def.id);
    setText('lblInstallPrompt', dict.installPrompt || '');
    setText('btnInstallApp', dict.installBtn);
    setText('btnLang', LANG_LABEL[state.lang]);
    setText('btnTheme', state.dark ? '☀️' : '🌙');
    setText('btnReset', dict.reset);
    // Farkle rotates turns, so "Turn:" is right there. Truco does not —
    // you pick the side that won the hand — so it overrides this.
    setText('lblActivePlayer', dict[def.activePlayerLabelKey || 'activePlayer']);
    setText('btnRenamePlayer', dict.rename);
    setText('btnAddPlayer', def.sideKind === 'team' ? dict.addTeam : dict.addPlayer);
    setText('btnFinishGame', dict.finishGame);
    setText('btnModalFinishGame', dict.modalFinishGame);
    setText('btnDockUndo', dict.undoBtn);
    setText('btnLeaderboard', dict.leaderboardBtn);
    setText('lblLeaderboardTitle', isGameOver() ? dict.gameOverTitle : dict.leaderboardTitle);
    setText('lblHistoryTitle', dict.historyTitle);
    setText('btnClearHistory', dict.clearHistory);
    setText('lblSides', def.sideKind === 'team' ? dict.teams : dict.players);
    setText('lblEntry', dict.entryTitle);
    setText('lblTarget', dict.targetShort(state.target));
    setText('targetLabel', dict.targetLong(state.target));
    if (TWO_PHASE) setText('lblPending', dict.pendingLabel);

    (def.actions || []).forEach(a => setText(`action-${a.id}`, dict[a.labelKey]));
    if ($('btnAddTyped')) setText('btnAddTyped', TWO_PHASE ? dict.addToTurn : dict.save);
    if ($('typedAmount')) $('typedAmount').placeholder = dict.inputPlaceholder(def.entry.max);

    // Undo lives in the dock only: always visible, labelled, and it
    // keeps the header to one line on a small phone.
    $('btnDockUndo').disabled = undoStack.length === 0;

    const side = current();
    // The screen takes the colour of the side being scored for.
    if (def.playerColors) applyPlayerColor(side.color);
    setText('activePlayerLabel', side.name);
    $('btnRemovePlayer').disabled = state.sides.length <= MIN_SIDES;
    $('btnAddPlayer').disabled = state.sides.length >= MAX_SIDES;

    if (TWO_PHASE) setText('pendingVal', state.pending);
    // The dock shows the selected side's standing. With a two-phase
    // game it includes the turn being built, so it reads as "what I'd
    // have if I banked now" — the number the decision turns on.
    setText('lblGrandTotal', side.name);
    setText('grandTotalVal', totalOf(side) + (TWO_PHASE ? state.pending : 0));

    // Sides list: name, their turn log summary, running total.
    const list = $('sidesList');
    list.innerHTML = '';
    const lead = leaderTotal();
    state.sides.forEach((s, idx) => {
      const total = totalOf(s);
      const row = document.createElement('div');
      row.className = 'row-item side-row' + (idx === state.turnIndex ? ' side-active' : '');
      row.dataset.sideId = s.id;

      const totalHtml = def.renderTotal
        ? def.renderTotal(total, def, dict, state)
        : `<span class="side-total-num">${total}</span>`;

      const reached = total >= state.target;
      const milestone = def.milestone && total >= def.milestone.at
        ? `<span class="milestone-chip">${escapeHtml(dict[def.milestone.labelKey])}</span>`
        : '';
      const lastFew = s.turns.slice(-4).map(x =>
        `<span class="turn-chip${x.kind !== 'score' ? ' turn-chip-' + x.kind : ''}">${x.amount > 0 ? '+' : ''}${x.amount}</span>`
      ).join('');

      row.innerHTML =
        `<div class="row-info">` +
          `<div class="row-title">` +
            (def.playerColors ? `<span class="player-dot pc-${escapeHtml(s.color)}"></span>` : '') +
            `${escapeHtml(s.name)} ${milestone}` +
            `${reached ? ` <span class="milestone-chip">${escapeHtml(dict.reachedTarget)}</span>` : ''}` +
          `</div>` +
          `<div class="row-desc turn-log">${lastFew || escapeHtml(dict.noTurnsYet)}</div>` +
        `</div>` +
        `<div class="side-total${total === lead && lead > 0 ? ' side-total-lead' : ''}">${totalHtml}</div>`;

      row.addEventListener('click', () => {
        state.turnIndex = idx;
        state.pending = 0;
        saveState();
        render();
      });
      list.appendChild(row);
    });
  }

  // ---------- Entry ----------

  function addAmount(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    if (TWO_PHASE) {
      const next = state.pending + n;
      if (next > def.entry.max) { showToast(t().maxScoreToast(def.entry.max)); return; }
      state.pending = next;
      saveState();
      render();
    } else {
      if (n > def.entry.max) { showToast(t().maxScoreToast(def.entry.max)); return; }
      api.commit(n, 'score');
    }
  }

  // ---------- Standings / history ----------

  function standingsWithWinner() {
    const ranked = standings();
    if (!state.winnerId) return ranked;
    const idx = ranked.findIndex(r => r.id === state.winnerId);
    if (idx < 0) return ranked;
    const [w] = ranked.splice(idx, 1);
    return [{ ...w, rank: 1 }, ...ranked.map((r, i) => ({ ...r, rank: i + 2 }))];
  }

  function openLeaderboard() {
    const dict = t();
    setText('lblLeaderboardTitle', isGameOver() ? dict.gameOverTitle : dict.leaderboardTitle);
    const list = $('leaderboardList');
    list.innerHTML = '';
    standingsWithWinner().forEach(e => {
      const div = document.createElement('div');
      div.className = 'leaderboard-item';
      div.innerHTML =
        `<span>${medalFor(e.rank)} ${escapeHtml(e.name)}</span><span>${e.total} pts</span>`;
      list.appendChild(div);
    });
    $('leaderboardModal').classList.add('open');
  }

  function hasAnythingToSave() {
    return state.sides.some(s => s.turns.length > 0);
  }

  // Filing a game: ask for an optional name, show what is being saved,
  // then commit. Replaces the browser confirm() that used to guard this.
  function openSaveModal() {
    const dict = t();
    if (!hasAnythingToSave()) { showToast(dict.emptyGameAlert); return; }
    setText('lblSaveTitle', dict.saveMatchTitle);
    setText('lblMatchName', dict.matchNameLabel);
    setText('lblFinalScore', dict.finalScore);
    setText('btnConfirmSave', dict.saveToHistory);
    const input = $('matchNameInput');
    input.placeholder = dict.matchNamePlaceholder;
    input.value = '';
    $('saveSummary').innerHTML = standingsWithWinner().map(e =>
      `<div class="rules-row">` +
        `<span class="rules-row-name">${medalFor(e.rank)} ${escapeHtml(e.name)}</span>` +
        `<span class="rules-row-value">${e.total}</span>` +
      `</div>`).join('');
    $('leaderboardModal').classList.remove('open');
    $('saveModal').classList.add('open');
    input.focus();
  }

  function closeSaveModal() { $('saveModal').classList.remove('open'); }

  function archiveCurrentGame(label) {
    const dict = t();
    if (!hasAnythingToSave()) { showToast(dict.emptyGameAlert); return; }

    pushUndoSnapshot();
    const ranked = standingsWithWinner();
    const winners = ranked.filter(r => r.rank === 1);
    history.unshift({
      id: 'g_' + Date.now(),
      game: def.id,
      label: label || '',
      dateISO: new Date().toISOString(),
      date: new Date().toLocaleDateString(state.lang === 'es' ? 'es-ES' : 'en-US', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      winner: winners[0],
      winners,
      standings: ranked
    });
    if (history.length > 50) history.pop();
    saveHistory();

    state.sides = state.sides.map(s => ({ ...s, turns: [] }));
    state.turnIndex = 0;
    state.pending = 0;
    state.winnerId = null;
    state.finalRoundLeft = null;
    saveState();
    $('leaderboardModal').classList.remove('open');
    closeSaveModal();
    render();
    showToast(dict.toastSaved);
  }

  function openHistoryModal() {
    const dict = t();
    const list = $('historyList');
    const banner = $('recordBanner');
    list.innerHTML = '';
    if (history.length === 0) {
      banner.style.display = 'none';
      list.innerHTML = `<div class="empty-state">${escapeHtml(dict.emptyHistory)}</div>`;
    } else {
      let best = { name: '-', total: -1 };
      history.forEach(g => {
        const top = (g.winners && g.winners[0]) || g.winner;
        if (top && top.total > best.total) best = top;
      });
      banner.style.display = 'flex';
      banner.innerHTML =
        `<span>${dict.recordLabel} ${escapeHtml(best.name)}</span><span>${best.total} pts</span>`;
      history.forEach(g => {
        const card = document.createElement('div');
        card.className = 'history-card';
        const rows = g.standings || [];
        const winners = g.winners || (g.winner ? [g.winner] : []);
        const names = winners.map(w => escapeHtml(w.name)).join(' & ');
        const score = winners.length ? winners[0].total : '';
        const chips = rows.map((s, i) =>
          `<span class="history-chip">${medalFor(typeof s.rank === 'number' ? s.rank : i + 1)} ${escapeHtml(s.name)}: ${s.total}</span>`
        ).join('');
        card.innerHTML =
          `<div class="history-card-top"><span>${escapeHtml(g.date)}</span>` +
          `<span>${rows.length} ${dict.playersShort}</span></div>` +
          (g.label ? `<div class="history-label">${escapeHtml(g.label)}</div>` : '') +
          `<div class="history-winner">🏆 ${names} — ${score} pts</div>` +
          `<div class="history-players">${chips}</div>`;
        list.appendChild(card);
      });
    }
    $('historyModal').classList.add('open');
  }

  // ---------- Mount ----------

  container.innerHTML = TEMPLATE;
  state = loadState();
  history = loadHistory();
  undoStack = (() => { const u = loadJSON(UNDO_KEY, []); return Array.isArray(u) ? u : []; })();

  import('../main.js').then(({ installPromptAvailable, triggerInstallPrompt }) => {
    const btn = $('btnInstallApp');
    if (btn) btn.addEventListener('click', async () => {
      if (!installPromptAvailable()) return;
      await triggerInstallPrompt();
      $('installBanner').classList.remove('visible');
    });
  });

  const rules = mountRules(def, () => state.lang, () => t());

  $('btnHome').addEventListener('click', () => { location.hash = '#/'; });
  $('btnDockUndo').addEventListener('click', performUndo);
  $('btnFinishGame').addEventListener('click', openSaveModal);
  $('btnModalFinishGame').addEventListener('click', openSaveModal);
  $('btnCloseSave').addEventListener('click', closeSaveModal);
  $('saveModal').addEventListener('click', e => {
    if (e.target.id === 'saveModal') closeSaveModal();
  });
  $('btnConfirmSave').addEventListener('click', () => {
    archiveCurrentGame($('matchNameInput').value.trim().slice(0, 40));
  });

  $('btnHistory').addEventListener('click', openHistoryModal);
  $('btnCloseHistory').addEventListener('click', () => $('historyModal').classList.remove('open'));
  $('historyModal').addEventListener('click', e => {
    if (e.target.id === 'historyModal') $('historyModal').classList.remove('open');
  });
  $('btnClearHistory').addEventListener('click', () => {
    if (history.length === 0) return;
    if (!confirm(t().clearHistoryConfirm)) return;
    history = [];
    saveHistory();
    openHistoryModal();
  });

  $('btnLang').addEventListener('click', () => {
    const key = def.sideKind === 'team' ? 'defaultTeamPrefix' : 'defaultPlayerPrefix';
    const oldPrefix = STRINGS[state.lang][key] + ' ';
    state.lang = state.lang === 'es' ? 'en' : 'es';
    const newPrefix = STRINGS[state.lang][key] + ' ';
    state.sides.forEach(s => {
      if (s.name.startsWith(oldPrefix)) {
        const suffix = s.name.slice(oldPrefix.length);
        if (/^\d+$/.test(suffix)) s.name = newPrefix + suffix;
      }
    });
    saveState();
    render();
    rules.refresh();
  });

  $('btnTheme').addEventListener('click', () => {
    state.dark = !state.dark;
    saveState();
    render();
  });

  $('btnAddPlayer').addEventListener('click', () => {
    const dict = t();
    if (state.sides.length >= MAX_SIDES) { alert(dict.maxPlayersAlert(MAX_SIDES)); return; }
    pushUndoSnapshot();
    const key = def.sideKind === 'team' ? 'defaultTeamPrefix' : 'defaultPlayerPrefix';
    const free = firstFreeColor(state.sides.map(s => s.color));
    state.sides.push(createSide(`${dict[key]} ${state.sides.length + 1}`, free));
    saveState();
    render();
  });

  // Name (and colour, where the game uses them) are edited together in
  // one in-app sheet, retiring the browser prompt().
  let pendingColor = null;

  function openPlayerModal() {
    const dict = t();
    const side = current();
    pendingColor = side.color;
    setText('lblPlayerModalTitle', def.sideKind === 'team' ? dict.editTeam : dict.editPlayer);
    setText('lblNameField', dict.nameLabel);
    setText('lblColorField', dict.colorLabel);
    setText('btnSavePlayer', dict.saveChanges);
    $('playerNameInput').value = side.name;
    // Truco scores two fixed teams, so it has no colour picker.
    $('colorFields').style.display = def.playerColors ? '' : 'none';
    if (def.playerColors) renderSwatches();
    $('playerModal').classList.add('open');
    $('playerNameInput').focus();
  }

  function renderSwatches() {
    const row = $('colorRow');
    row.innerHTML = colorSwatchesHtml(pendingColor, state.lang);
    const taken = state.sides.filter((_, i) => i !== state.turnIndex).map(s => s.color);
    row.querySelectorAll('.swatch').forEach(btn => {
      if (taken.includes(btn.dataset.color)) btn.classList.add('taken');
      btn.addEventListener('click', () => {
        pendingColor = btn.dataset.color;
        renderSwatches();
      });
    });
  }

  function closePlayerModal() { $('playerModal').classList.remove('open'); }

  $('btnRenamePlayer').addEventListener('click', openPlayerModal);
  $('btnClosePlayerModal').addEventListener('click', closePlayerModal);
  $('playerModal').addEventListener('click', e => {
    if (e.target.id === 'playerModal') closePlayerModal();
  });
  $('btnSavePlayer').addEventListener('click', () => {
    const side = current();
    const name = $('playerNameInput').value.trim().slice(0, 18);
    pushUndoSnapshot();
    if (name) side.name = name;
    if (def.playerColors && pendingColor && isValidColor(pendingColor)) side.color = pendingColor;
    saveState();
    closePlayerModal();
    render();
  });

  $('btnRemovePlayer').addEventListener('click', () => {
    if (state.sides.length <= MIN_SIDES) return;
    const side = current();
    if (!confirm(t().deleteConfirm(side.name))) return;
    pushUndoSnapshot();
    state.sides.splice(state.turnIndex, 1);
    state.turnIndex = Math.max(0, Math.min(state.turnIndex, state.sides.length - 1));
    state.pending = 0;
    saveState();
    render();
  });

  $('btnReset').addEventListener('click', () => {
    if (!confirm(t().resetConfirm)) return;
    pushUndoSnapshot();
    state.sides = state.sides.map(s => ({ ...s, turns: [] }));
    state.turnIndex = 0;
    state.pending = 0;
    state.winnerId = null;
    state.finalRoundLeft = null;
    saveState();
    render();
  });

  $('presetGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-add]');
    if (btn) addAmount(Number(btn.dataset.add));
  });

  if ($('btnAddTyped')) {
    $('btnAddTyped').addEventListener('click', () => {
      const input = $('typedAmount');
      const n = parseInt(input.value, 10);
      if (Number.isNaN(n) || n <= 0) return;
      addAmount(n);
      input.value = '';
    });
  }

  (def.actions || []).forEach(a => {
    $(`action-${a.id}`).addEventListener('click', () => a.run(api));
  });

  $('btnLeaderboard').addEventListener('click', openLeaderboard);
  $('btnCloseLeaderboard').addEventListener('click', () => $('leaderboardModal').classList.remove('open'));
  $('leaderboardModal').addEventListener('click', e => {
    if (e.target.id === 'leaderboardModal') $('leaderboardModal').classList.remove('open');
  });

  render();
}
