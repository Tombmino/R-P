// Reusable score-sheet engine for games played on a fixed grid of boxes
// that each get filled exactly once (Yahtzee, Generala).
//
// A game supplies a definition; the engine owns everything else: state,
// persistence, the undo stack, the player roster, rendering, the score
// entry sheet, standings, history and end-of-game detection.
//
// ---------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------
// {
//   id:          'yahtzee',               // route/id
//   storageKey:  'yahtzee',               // -> sk.yahtzee.state / .history / .undo
//   version:     'v0.7',                  // shown as a badge
//   titleKey:    'gameTitle',             // key in the game's own strings
//   maxPlayers:  6,
//   strings:     { es: {...}, en: {...} },// merged over core/i18n COMMON
//   sections: [{
//     id:          'upper',
//     labelKey:    'upperSection',
//     categories:  [ ...see below... ],
//     subtotalKey: 'upperSubtotal',       // optional: show a subtotal row
//     bonus: {                            // optional: threshold bonus row
//       threshold: 63, value: 35,
//       labelKey: 'upperBonus',
//       remainingKey: 'bonusRemaining',   // (n) => string
//       reachedKey:   'bonusReached'
//     }
//   }],
//   extras: [{                            // optional: counters under a section
//     id: 'extraYahtzee', value: 100, sectionId: 'lower',
//     titleKey: 'extraTitle', descKey: 'extraDesc',
//     requires: (player) => boolean,      // gate on the card's own state
//     blockedKey: 'needYahtzeeToast'
//   }],
//   instantWin: (player) => boolean       // optional: ends the game at once
// }
//
// Category shapes:
//   { id, entry: { kind: 'face',    face: 1..6 } }
//        -> six buttons, 0..5 dice showing that face
//   { id, entry: { kind: 'options', options: [{ value, labelKey? }] } }
//        -> one button per option (one for a plain fixed box, two for
//           Generala's normal / servida)
//   { id, entry: { kind: 'sum',     max: 30, presets: [10, 15, ...] } }
//        -> free numeric entry capped at max, plus preset buttons
// Optional per-category gate:
//   { id, requires: (player) => boolean, blockedKey: 'needGeneralaToast' }
// ---------------------------------------------------------------------

import { loadJSON, saveJSON } from './storage.js';
import { showToast, escapeHtml } from './ui.js';
import { mergeStrings, LANG_LABEL } from './i18n.js';
import { mountRules, RULES_MODAL_HTML } from './rules.js';
import { rankPlayers, medalFor } from './standings.js';
import { defaultColorFor, isValidColor, firstFreeColor, colorSwatchesHtml, applyPlayerColor, clearPlayerColor } from './colors.js';

const MAX_UNDO = 25;

export function mountScorecard(container, def) {
  const STRINGS = mergeStrings(def.strings);
  const MAX_PLAYERS = def.maxPlayers || 6;
  const STATE_KEY = `${def.storageKey}.state`;
  const HISTORY_KEY = `${def.storageKey}.history`;
  const UNDO_KEY = `${def.storageKey}.undo`;
  const EXTRAS = def.extras || [];

  const allCategories = def.sections.flatMap(s => s.categories);

  let state, history, undoStack, editingCategory;

  const t = () => STRINGS[state.lang] || STRINGS.es;

  // ---------- State ----------

  function createEmptyScores() {
    const scores = {};
    allCategories.forEach(c => { scores[c.id] = null; });
    return scores;
  }

  function createEmptyExtras() {
    const extras = {};
    EXTRAS.forEach(e => { extras[e.id] = 0; });
    return extras;
  }

  function createPlayer(name, color) {
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name,
      color: color || defaultColorFor(0),
      scores: createEmptyScores(),
      extras: createEmptyExtras()
    };
  }

  function defaultState() {
    const prefix = STRINGS.es.defaultPlayerPrefix;
    return {
      lang: 'es',
      dark: false,
      autoAdvance: true,
      turnIndex: 0,   // whose turn it is
      viewIndex: 0,   // whose card is on screen
      winnerId: null, // set by instantWin
      players: [
        createPlayer(`${prefix} 1`, defaultColorFor(0)),
        createPlayer(`${prefix} 2`, defaultColorFor(1))
      ]
    };
  }

  // Normalise a stored player so missing boxes/extras don't crash render.
  // Saves written before colours existed get one assigned by position.
  function normalisePlayer(p, index = 0) {
    const scores = createEmptyScores();
    if (p && p.scores) {
      for (const k of Object.keys(scores)) {
        if (typeof p.scores[k] === 'number') scores[k] = p.scores[k];
      }
    }
    const extras = createEmptyExtras();
    if (p && p.extras) {
      for (const k of Object.keys(extras)) {
        if (typeof p.extras[k] === 'number') extras[k] = p.extras[k];
      }
    }
    return {
      id: (p && p.id) || 'p_' + Math.random().toString(36).slice(2, 9),
      name: (p && typeof p.name === 'string' && p.name) || 'Jugador',
      color: (p && isValidColor(p.color)) ? p.color : defaultColorFor(index),
      scores,
      extras
    };
  }

  function loadState() {
    const parsed = loadJSON(STATE_KEY, null);
    if (!parsed || !Array.isArray(parsed.players) || parsed.players.length === 0) {
      return defaultState();
    }
    const players = parsed.players.map((p, i) => normalisePlayer(p, i));
    const legacy = typeof parsed.activeIndex === 'number' ? parsed.activeIndex : 0;
    const rawTurn = typeof parsed.turnIndex === 'number' ? parsed.turnIndex : legacy;
    const rawView = typeof parsed.viewIndex === 'number' ? parsed.viewIndex : rawTurn;
    const clamp = (n) => Math.min(Math.max(0, n), players.length - 1);
    return {
      lang: parsed.lang === 'en' ? 'en' : 'es',
      dark: Boolean(parsed.dark),
      autoAdvance: parsed.autoAdvance !== undefined ? Boolean(parsed.autoAdvance) : true,
      turnIndex: clamp(rawTurn),
      viewIndex: clamp(rawView),
      winnerId: parsed.winnerId || null,
      players
    };
  }

  const saveState = () => saveJSON(STATE_KEY, state);

  function loadHistory() {
    const parsed = loadJSON(HISTORY_KEY, []);
    if (!Array.isArray(parsed)) return [];
    // Old entries only had `winner` (singular).
    return parsed.map(e => (e.winners ? e : (e.winner ? { ...e, winners: [e.winner] } : e)));
  }

  const saveHistory = () => saveJSON(HISTORY_KEY, history);
  const saveUndoStack = () => saveJSON(UNDO_KEY, undoStack);

  function pushUndoSnapshot() {
    undoStack.push(JSON.stringify({
      turnIndex: state.turnIndex,
      viewIndex: state.viewIndex,
      winnerId: state.winnerId,
      players: state.players,
      history
    }));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    saveUndoStack();
  }

  function performUndo() {
    if (undoStack.length === 0) return;
    const prev = JSON.parse(undoStack.pop());
    state.players = prev.players.map((p, i) => normalisePlayer(p, i));
    const clamp = (n) => Math.min(Math.max(0, n), state.players.length - 1);
    state.turnIndex = clamp(prev.turnIndex ?? 0);
    state.viewIndex = clamp(prev.viewIndex ?? state.turnIndex);
    state.winnerId = prev.winnerId ?? null;
    if (Array.isArray(prev.history)) { history = prev.history; saveHistory(); }
    saveState();
    saveUndoStack();
    render();
    showToast(t().toastUndone);
  }

  // ---------- Totals ----------

  function sectionSum(player, section) {
    return section.categories.reduce((acc, cat) => {
      const v = player.scores[cat.id];
      return acc + (typeof v === 'number' ? v : 0);
    }, 0);
  }

  function sectionBonus(player, section) {
    if (!section.bonus) return 0;
    return sectionSum(player, section) >= section.bonus.threshold ? section.bonus.value : 0;
  }

  function extrasTotal(player) {
    return EXTRAS.reduce((acc, e) => acc + ((player.extras[e.id] || 0) * e.value), 0);
  }

  function grandTotal(player) {
    let total = extrasTotal(player);
    def.sections.forEach(s => {
      total += sectionSum(player, s) + sectionBonus(player, s);
    });
    return total;
  }

  function filledIn(player, section) {
    return section.categories.filter(c => player.scores[c.id] !== null).length;
  }

  const cardIsFull = (p) => allCategories.every(c => p.scores[c.id] !== null);
  const everyCardFull = () => state.players.length > 0 && state.players.every(cardIsFull);
  const isGameOver = () => Boolean(state.winnerId) || everyCardFull();

  function standings() {
    return rankPlayers(state.players.map(p => ({
      id: p.id, name: p.name, total: grandTotal(p)
    })));
  }

  // When a player wins outright (e.g. Generala servida) they top the
  // standings regardless of raw points.
  function standingsWithWinner() {
    const ranked = standings();
    if (!state.winnerId) return ranked;
    const idx = ranked.findIndex(r => r.id === state.winnerId);
    if (idx < 0) return ranked;
    const [winner] = ranked.splice(idx, 1);
    const rest = ranked.map((r, i) => ({ ...r, rank: i + 2 }));
    return [{ ...winner, rank: 1 }, ...rest];
  }

  // ---------- Template ----------

  function sectionHtml(section) {
    const extrasHtml = EXTRAS
      .filter(e => (e.sectionId || def.sections[def.sections.length - 1].id) === section.id)
      .map(e => `
        <div class="extra-yahtzee-box">
          <div>
            <div class="row-title" id="extra-${e.id}-title"></div>
            <div class="row-desc" id="extra-${e.id}-desc"></div>
          </div>
          <div class="counter-pill">
            <button id="extra-${e.id}-minus" aria-label="−">−</button>
            <strong id="extra-${e.id}-count">0</strong>
            <button id="extra-${e.id}-plus" aria-label="+">+</button>
          </div>
        </div>
      `).join('');

    const subtotalHtml = section.subtotalKey ? `
      <div class="summary-row">
        <div>
          <div id="section-${section.id}-subtotal-label"></div>
          ${section.bonus ? `<div class="bonus-progress" id="section-${section.id}-progress"></div>` : ''}
        </div>
        <strong id="section-${section.id}-subtotal">0</strong>
      </div>` : '';

    const bonusHtml = section.bonus ? `
      <div class="summary-row">
        <div><div id="section-${section.id}-bonus-label"></div></div>
        <strong id="section-${section.id}-bonus">0</strong>
      </div>` : '';

    return `
      <section class="section-card">
        <div class="section-header">
          <span id="section-${section.id}-label"></span>
          <span id="section-${section.id}-count">0 / ${section.categories.length}</span>
        </div>
        <div id="section-${section.id}-rows"></div>
        ${subtotalHtml}
        ${bonusHtml}
        ${extrasHtml}
      </section>`;
  }

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
            <span class="badge">${escapeHtml(def.version || '')}</span>
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

        <div id="playersBar" class="players-bar"></div>

        <div class="player-controls">
          <div>
            <span id="lblActivePlayer"></span> <strong id="activePlayerLabel">-</strong>
            <span id="viewingNote" class="row-desc"></span>
          </div>
          <div style="display:flex; gap:6px;">
            <button id="btnRenamePlayer"></button>
            <button id="btnAddPlayer"></button>
            <button id="btnRemovePlayer" class="danger-outline" aria-label="✕">✕</button>
          </div>
        </div>

        <div class="settings-strip">
          <label class="toggle-label">
            <input type="checkbox" id="chkAutoAdvance" />
            <span id="lblAutoAdvance"></span>
          </label>
          <button id="btnFinishGame" class="success-btn"></button>
        </div>
      </header>

      <main>${def.sections.map(sectionHtml).join('')}</main>
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

    <div id="scoreModal" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-sheet">
        <div class="modal-header">
          <div>
            <h2 id="modalTitle"></h2>
            <div class="row-desc" id="modalSubtitle"></div>
          </div>
          <button id="btnCloseModal" aria-label="✕">✕</button>
        </div>
        <div id="modalBody"></div>
        <div class="modal-footer-actions">
          <button id="btnZeroScore" class="danger-outline"></button>
          <button id="btnClearScore"></button>
        </div>
      </div>
    </div>

    ${RULES_MODAL_HTML}

    <div id="playerModal" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2 id="lblPlayerModalTitle"></h2>
          <button id="btnClosePlayerModal" aria-label="✕">✕</button>
        </div>
        <div class="field-label" id="lblNameField"></div>
        <input type="text" id="playerNameInput" maxlength="18" />
        <div class="field-label" id="lblColorField" style="margin-top:14px"></div>
        <div class="color-row" id="colorRow"></div>
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
    setText('lblActivePlayer', dict.activePlayer);
    setText('btnRenamePlayer', dict.rename);
    setText('btnAddPlayer', dict.addPlayer);
    setText('lblAutoAdvance', dict.autoAdvance);
    setText('btnFinishGame', dict.finishGame);
    setText('btnModalFinishGame', dict.modalFinishGame);
    setText('btnDockUndo', dict.undoBtn);
    setText('lblGrandTotal', dict.grandTotal);
    setText('btnLeaderboard', dict.leaderboardBtn);
    setText('lblLeaderboardTitle', isGameOver() ? dict.gameOverTitle : dict.leaderboardTitle);
    setText('lblHistoryTitle', dict.historyTitle);
    setText('btnClearHistory', dict.clearHistory);
    setText('btnZeroScore', dict.scratchZero);
    setText('btnClearScore', dict.clearEmpty);
    $('chkAutoAdvance').checked = state.autoAdvance;

    // Undo lives in the dock only: always visible, labelled, and it
    // keeps the header to one line on a small phone.
    $('btnDockUndo').disabled = undoStack.length === 0;

    const turnPlayer = state.players[state.turnIndex];
    const viewPlayer = state.players[state.viewIndex];

    // The screen takes the colour of the player whose card is showing.
    // That is the turn player almost always; when you deliberately look
    // back at someone else's card the colour follows the card, because
    // those are the boxes you'd be filling.
    if (def.playerColors) applyPlayerColor(viewPlayer.color);
    setText('activePlayerLabel', turnPlayer.name);
    const note = $('viewingNote');
    if (state.viewIndex !== state.turnIndex) {
      note.textContent = dict.viewingNote(viewPlayer.name);
      note.style.display = '';
    } else {
      note.textContent = '';
      note.style.display = 'none';
    }
    $('btnRemovePlayer').disabled = state.players.length <= 1;

    // Players bar
    const bar = $('playersBar');
    bar.innerHTML = '';
    state.players.forEach((p, idx) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'player-tab' + (idx === state.viewIndex ? ' active' : '');
      tab.innerHTML =
        (def.playerColors ? `<span class="player-dot pc-${escapeHtml(p.color)}"></span>` : '') +
        `<span class="p-name">${escapeHtml(p.name)}</span>` +
        `<span class="p-score">${grandTotal(p)}</span>`;
      tab.addEventListener('click', () => {
        state.viewIndex = idx;
        saveState();
        render();
      });
      bar.appendChild(tab);
    });

    // Sections
    def.sections.forEach(section => {
      setText(`section-${section.id}-label`, dict[section.labelKey] || section.id);
      const rows = $(`section-${section.id}-rows`);
      rows.innerHTML = '';
      section.categories.forEach(cat => {
        rows.appendChild(buildCategoryRow(cat, viewPlayer));
      });
      setText(`section-${section.id}-count`,
        `${filledIn(viewPlayer, section)} / ${section.categories.length}`);

      if (section.subtotalKey) {
        setText(`section-${section.id}-subtotal-label`, dict[section.subtotalKey]);
        setText(`section-${section.id}-subtotal`, sectionSum(viewPlayer, section));
      }
      if (section.bonus) {
        const sum = sectionSum(viewPlayer, section);
        const bonus = sectionBonus(viewPlayer, section);
        setText(`section-${section.id}-bonus-label`, dict[section.bonus.labelKey]);
        const bonusEl = $(`section-${section.id}-bonus`);
        bonusEl.textContent = bonus > 0 ? `+${bonus}` : '0';
        bonusEl.className = bonus > 0 ? 'bonus-achieved' : '';
        const progEl = $(`section-${section.id}-progress`);
        if (progEl) {
          progEl.textContent = sum >= section.bonus.threshold
            ? dict[section.bonus.reachedKey]
            : dict[section.bonus.remainingKey](section.bonus.threshold - sum);
        }
      }
    });

    // Extra counters
    EXTRAS.forEach(e => {
      setText(`extra-${e.id}-title`, dict[e.titleKey]);
      setText(`extra-${e.id}-desc`, dict[e.descKey]);
      setText(`extra-${e.id}-count`, viewPlayer.extras[e.id] || 0);
    });

    setText('grandTotalVal', grandTotal(viewPlayer));
  }

  function buildCategoryRow(cat, player) {
    const dict = t();
    const text = dict.categories[cat.id] || { name: cat.id, desc: '' };
    const val = player.scores[cat.id];

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row-item';
    row.setAttribute('aria-label', text.name);

    let badgeClass = 'row-score';
    let badgeText = '—';
    if (typeof val === 'number') {
      badgeClass += val === 0 ? ' zeroed' : ' filled';
      badgeText = String(val);
    }

    row.innerHTML =
      `<div class="row-info">` +
        `<div class="row-title">${escapeHtml(text.name)}</div>` +
        `<div class="row-desc">${escapeHtml(text.desc)}</div>` +
      `</div>` +
      `<div class="${badgeClass}">${badgeText}</div>`;

    row.addEventListener('click', () => openScoreModal(cat));
    return row;
  }

  // ---------- Score entry ----------

  function openScoreModal(cat) {
    const dict = t();
    const player = state.players[state.viewIndex];

    // A gated box (Generala's Doble Generala) explains itself instead of
    // opening an entry sheet the player can't legally use.
    if (cat.requires && !cat.requires(player)) {
      showToast(dict[cat.blockedKey]);
      return;
    }

    editingCategory = cat;
    const text = dict.categories[cat.id] || { name: cat.id, desc: '' };
    const currentVal = player.scores[cat.id];

    setText('modalTitle', text.name);
    setText('modalSubtitle',
      `${player.name} · ${dict.currentLabel}: ${currentVal === null ? dict.emptyLabel : currentVal + ' pts'}`);

    const body = $('modalBody');
    body.innerHTML = '';
    const entry = cat.entry;

    if (entry.kind === 'face') {
      const grid = document.createElement('div');
      grid.className = 'dice-grid';
      for (let count = 0; count <= 5; count++) {
        const pts = count * entry.face;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'die-btn' + (currentVal === pts && currentVal !== null ? ' primary' : '');
        btn.innerHTML = `<span class="count">${count}d</span><span class="pts">${pts}p</span>`;
        btn.addEventListener('click', () => setCategoryScore(cat.id, pts));
        grid.appendChild(btn);
      }
      body.appendChild(grid);

    } else if (entry.kind === 'options') {
      const wrap = document.createElement('div');
      wrap.className = 'quick-options';
      entry.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'primary';
        btn.style.gridColumn = entry.options.length === 1 ? '1 / -1' : '';
        btn.style.padding = '14px';
        btn.style.fontSize = '1rem';
        const label = opt.labelKey ? dict[opt.labelKey] : null;
        btn.innerHTML = label
          ? `<span style="display:block;font-size:.78rem;opacity:.85">${escapeHtml(label)}</span>${opt.value} pts`
          : dict.scoreFixed(opt.value);
        btn.addEventListener('click', () => setCategoryScore(cat.id, opt.value));
        wrap.appendChild(btn);
      });
      body.appendChild(wrap);

    } else { // 'sum'
      const max = entry.max;
      const inputRow = document.createElement('div');
      inputRow.className = 'custom-input-row';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(max);
      input.placeholder = dict.inputPlaceholder(max);
      input.value = typeof currentVal === 'number' ? currentVal : '';

      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'primary';
      apply.textContent = dict.save;
      apply.addEventListener('click', () => {
        const parsed = parseInt(input.value, 10);
        if (Number.isNaN(parsed) || parsed < 0) return;
        if (parsed > max) { showToast(dict.maxScoreToast(max)); return; }
        setCategoryScore(cat.id, parsed);
      });

      inputRow.appendChild(input);
      inputRow.appendChild(apply);
      body.appendChild(inputRow);

      if (entry.presets && entry.presets.length) {
        const pad = document.createElement('div');
        pad.className = 'numpad';
        entry.presets.forEach(v => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = `${v} pts`;
          b.addEventListener('click', () => setCategoryScore(cat.id, v));
          pad.appendChild(b);
        });
        body.appendChild(pad);
      }
    }

    $('scoreModal').classList.add('open');
  }

  function closeScoreModal() {
    editingCategory = null;
    $('scoreModal').classList.remove('open');
  }

  // Scoring writes to the player being VIEWED. The turn only advances
  // when the viewer is the player whose turn it is — the exception being
  // a correction to someone's earlier box.
  function setCategoryScore(catId, value) {
    pushUndoSnapshot();
    const ownTurn = state.viewIndex === state.turnIndex;
    const player = state.players[state.viewIndex];
    player.scores[catId] = value;

    let instantWinner = null;
    if (def.instantWin && def.instantWin(player)) {
      state.winnerId = player.id;
      instantWinner = player.name;
    }

    let advancedTo = null;
    if (!instantWinner && value !== null && ownTurn && state.autoAdvance && state.players.length > 1) {
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      state.viewIndex = state.turnIndex;
      advancedTo = state.players[state.turnIndex].name;
    }

    saveState();
    closeScoreModal();
    render();

    if (instantWinner) {
      showToast(t().instantWinToast(instantWinner));
      openLeaderboard();
    } else {
      if (advancedTo) showToast(t().toastTurn(advancedTo));
      if (isGameOver()) openLeaderboard();
    }
  }

  // ---------- Standings / history ----------

  function openLeaderboard() {
    const dict = t();
    setText('lblLeaderboardTitle', isGameOver() ? dict.gameOverTitle : dict.leaderboardTitle);
    const list = $('leaderboardList');
    list.innerHTML = '';
    standingsWithWinner().forEach(entry => {
      const div = document.createElement('div');
      div.className = 'leaderboard-item';
      div.innerHTML =
        `<span>${medalFor(entry.rank)} ${escapeHtml(entry.name)}</span>` +
        `<span>${entry.total} pts</span>`;
      list.appendChild(div);
    });
    $('leaderboardModal').classList.add('open');
  }

  function archiveCurrentGame() {
    const dict = t();
    const hasAnyPoints = state.players.some(p =>
      Object.values(p.scores).some(v => v !== null) ||
      Object.values(p.extras).some(v => v > 0)
    );
    if (!hasAnyPoints) { alert(dict.emptyGameAlert); return; }
    if (!confirm(dict.finishConfirm)) return;

    // Snapshot first, so undo restores the scores AND removes the entry.
    pushUndoSnapshot();

    const ranked = standingsWithWinner();
    const winners = ranked.filter(r => r.rank === 1);
    history.unshift({
      id: 'g_' + Date.now(),
      game: def.id,
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

    state.players = state.players.map(p => ({
      ...p, scores: createEmptyScores(), extras: createEmptyExtras()
    }));
    state.turnIndex = 0;
    state.viewIndex = 0;
    state.winnerId = null;
    saveState();

    $('leaderboardModal').classList.remove('open');
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
        const chips = rows.map((s, idx) =>
          `<span class="history-chip">${medalFor(typeof s.rank === 'number' ? s.rank : idx + 1)} ${escapeHtml(s.name)}: ${s.total}</span>`
        ).join('');
        card.innerHTML =
          `<div class="history-card-top">` +
            `<span>${escapeHtml(g.date)}</span>` +
            `<span>${rows.length} ${dict.playersShort}</span>` +
          `</div>` +
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
  editingCategory = null;

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

  $('chkAutoAdvance').addEventListener('change', (e) => {
    state.autoAdvance = e.target.checked;
    saveState();
  });

  $('btnFinishGame').addEventListener('click', archiveCurrentGame);
  $('btnModalFinishGame').addEventListener('click', archiveCurrentGame);

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
    const oldPrefix = STRINGS[state.lang].defaultPlayerPrefix + ' ';
    state.lang = state.lang === 'es' ? 'en' : 'es';
    const newPrefix = STRINGS[state.lang].defaultPlayerPrefix + ' ';
    state.players.forEach(p => {
      if (p.name.startsWith(oldPrefix)) {
        const suffix = p.name.slice(oldPrefix.length);
        if (/^\d+$/.test(suffix)) p.name = newPrefix + suffix;
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
    if (state.players.length >= MAX_PLAYERS) { alert(dict.maxPlayersAlert(MAX_PLAYERS)); return; }
    pushUndoSnapshot();
    const free = firstFreeColor(state.players.map(p => p.color));
    state.players.push(createPlayer(`${dict.defaultPlayerPrefix} ${state.players.length + 1}`, free));
    state.turnIndex = state.players.length - 1;
    state.viewIndex = state.turnIndex;
    saveState();
    render();
  });

  // Name and colour are edited together in one in-app sheet. This also
  // retires the browser prompt() that used to handle renaming.
  let pendingColor = null;

  function openPlayerModal() {
    const dict = t();
    const p = state.players[state.viewIndex];
    pendingColor = p.color;
    setText('lblPlayerModalTitle', dict.editPlayer);
    setText('lblNameField', dict.nameLabel);
    setText('lblColorField', dict.colorLabel);
    setText('btnSavePlayer', dict.saveChanges);
    $('playerNameInput').value = p.name;
    renderSwatches();
    $('playerModal').classList.add('open');
    $('playerNameInput').focus();
  }

  function renderSwatches() {
    const row = $('colorRow');
    row.innerHTML = colorSwatchesHtml(pendingColor, state.lang);
    // Colours already in use elsewhere are dimmed but still choosable —
    // some tables genuinely want two blues, and blocking it would be
    // more annoying than the clash.
    const taken = state.players
      .filter((_, i) => i !== state.viewIndex)
      .map(p => p.color);
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
    const p = state.players[state.viewIndex];
    const name = $('playerNameInput').value.trim().slice(0, 18);
    pushUndoSnapshot();
    if (name) p.name = name;
    if (pendingColor && isValidColor(pendingColor)) p.color = pendingColor;
    saveState();
    closePlayerModal();
    render();
  });

  $('btnRemovePlayer').addEventListener('click', () => {
    if (state.players.length <= 1) return;
    const current = state.players[state.viewIndex];
    if (!confirm(t().deleteConfirm(current.name))) return;
    pushUndoSnapshot();
    const removed = state.viewIndex;
    state.players.splice(removed, 1);
    if (state.turnIndex > removed) state.turnIndex -= 1;
    else if (state.turnIndex === removed) state.turnIndex = Math.max(0, state.turnIndex - 1);
    state.viewIndex = Math.max(0, Math.min(removed, state.players.length - 1));
    state.turnIndex = Math.max(0, Math.min(state.turnIndex, state.players.length - 1));
    saveState();
    render();
  });

  EXTRAS.forEach(e => {
    $(`extra-${e.id}-minus`).addEventListener('click', () => {
      const p = state.players[state.viewIndex];
      if ((p.extras[e.id] || 0) <= 0) return;
      pushUndoSnapshot();
      p.extras[e.id] = Math.max(0, (p.extras[e.id] || 0) - 1);
      saveState();
      render();
    });
    $(`extra-${e.id}-plus`).addEventListener('click', () => {
      const p = state.players[state.viewIndex];
      if (e.requires && !e.requires(p)) { showToast(t()[e.blockedKey]); return; }
      pushUndoSnapshot();
      p.extras[e.id] = (p.extras[e.id] || 0) + 1;
      saveState();
      render();
    });
  });

  $('btnReset').addEventListener('click', () => {
    if (!confirm(t().resetConfirm)) return;
    pushUndoSnapshot();
    state.players = state.players.map(p => ({
      ...p, scores: createEmptyScores(), extras: createEmptyExtras()
    }));
    state.turnIndex = 0;
    state.viewIndex = 0;
    state.winnerId = null;
    saveState();
    render();
  });

  $('btnCloseModal').addEventListener('click', closeScoreModal);
  $('scoreModal').addEventListener('click', e => {
    if (e.target.id === 'scoreModal') closeScoreModal();
  });
  $('btnZeroScore').addEventListener('click', () => {
    if (editingCategory) setCategoryScore(editingCategory.id, 0);
  });
  $('btnClearScore').addEventListener('click', () => {
    if (editingCategory) setCategoryScore(editingCategory.id, null);
  });

  $('btnLeaderboard').addEventListener('click', openLeaderboard);
  $('btnCloseLeaderboard').addEventListener('click', () => $('leaderboardModal').classList.remove('open'));
  $('leaderboardModal').addEventListener('click', e => {
    if (e.target.id === 'leaderboardModal') $('leaderboardModal').classList.remove('open');
  });

  render();
}
