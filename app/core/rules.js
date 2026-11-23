// The rules sheet: what the game is, what each box or call is worth,
// and which house rules this app is applying.
//
// Read-only for now — nothing here is tappable to change a setting.
//
// The scoring table for score-sheet games is DERIVED from the game's
// own category data rather than written out again, so the rules on
// screen cannot drift from the rules being scored. Change a value in
// the game definition and the sheet follows. Running-total games have
// no per-box data to derive from (Farkle's combinations never enter
// the app — players work them out with real dice), so those declare
// their table in their own file, next to the scoring they describe.
//
// The prose is written from scratch. Nothing is copied from any
// publisher's rulebook.

import { escapeHtml } from './ui.js';
import { speechSupported, hasVoiceFor, onVoicesReady, speak, stop, isSpeaking } from './speech.js';

// Six consecutive "add up the dice showing that number" rows is noise,
// so a run of face categories collapses into a single line.
function collapseFaces(categories, dict) {
  const rows = [];
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const first = dict.categories[run[0].id]?.name || run[0].id;
    const last = dict.categories[run[run.length - 1].id]?.name || run[run.length - 1].id;
    rows.push({
      name: run.length > 1 ? `${first} – ${last}` : first,
      value: dict.rulesFaceValue
    });
    run = [];
  };
  categories.forEach(cat => {
    if (cat.entry.kind === 'face') { run.push(cat); return; }
    flush();
    const name = dict.categories[cat.id]?.name || cat.id;
    if (cat.entry.kind === 'sum') {
      rows.push({ name, value: dict.rulesSumValue });
    } else {
      rows.push({
        name,
        value: cat.entry.options
          .map(o => (o.labelKey ? `${dict[o.labelKey]} ${o.value}` : `${o.value} pts`))
          .join(' · ')
      });
    }
  });
  flush();
  return rows;
}

function deriveScoringRows(def, dict) {
  const rows = [];
  (def.sections || []).forEach(section => {
    rows.push(...collapseFaces(section.categories, dict));
    if (section.bonus) {
      rows.push({ name: dict[section.bonus.labelKey], value: `+${section.bonus.value}` });
    }
  });
  (def.extras || []).forEach(x => {
    rows.push({ name: dict[x.titleKey], value: `+${x.value}` });
  });
  return rows;
}

function scoringRows(def, dict, lang) {
  const declared = def.rules && def.rules[lang] && def.rules[lang].scoring;
  if (declared && declared.length) return declared;
  return deriveScoringRows(def, dict);
}

export function rulesHtml(def, dict, lang) {
  const r = (def.rules && def.rules[lang]) || {};
  const rows = scoringRows(def, dict, lang);

  const table = rows.map(row => `
    <div class="rules-row">
      <span class="rules-row-name">${escapeHtml(row.name)}</span>
      <span class="rules-row-value">${escapeHtml(row.value)}</span>
    </div>`).join('');

  const house = (r.houseRules || []).map(line =>
    `<li>${escapeHtml(line)}</li>`).join('');

  return `
    <p class="rules-intro">${escapeHtml(r.howItWorks || '')}</p>
    <h3 class="rules-heading">${escapeHtml(dict.scoringTitle)}</h3>
    <div class="rules-table">${table}</div>
    ${house ? `
      <h3 class="rules-heading">${escapeHtml(dict.houseRulesTitle)}</h3>
      <ul class="rules-list">${house}</ul>` : ''}
    ${r.note ? `<p class="rules-note">${escapeHtml(r.note)}</p>` : ''}
  `;
}

// What gets read aloud: the same content, flattened into sentences.
export function rulesSpeech(def, dict, lang) {
  const r = (def.rules && def.rules[lang]) || {};
  const lines = [];
  if (r.howItWorks) lines.push(r.howItWorks);
  lines.push(dict.scoringTitle + '.');
  scoringRows(def, dict, lang).forEach(row => lines.push(`${row.name}: ${row.value}.`));
  if (r.houseRules && r.houseRules.length) {
    lines.push(dict.houseRulesTitle + '.');
    r.houseRules.forEach(l => lines.push(l));
  }
  return lines;
}

// Wires the 📖 button, the sheet and the read-aloud control. Both
// engines call this once at mount and then just call the returned
// refresh() whenever the language changes.
export function mountRules(def, getLang, getDict) {
  const $ = (id) => document.getElementById(id);
  let stopVoicesListener = null;

  function updateSpeechButton() {
    const btn = $('btnReadAloud');
    if (!btn) return;
    const lang = getLang();
    const usable = speechSupported() && hasVoiceFor(lang);
    // Hidden rather than disabled: a greyed-out button invites people
    // to wonder what they did wrong.
    btn.style.display = usable ? '' : 'none';
    btn.textContent = isSpeaking() ? getDict().stopReading : getDict().readAloud;
  }

  function refresh() {
    const dict = getDict();
    const lang = getLang();
    $('lblRulesTitle').textContent = dict.rulesTitle;
    $('rulesBody').innerHTML = rulesHtml(def, dict, lang);
    updateSpeechButton();
  }

  function open() {
    refresh();
    $('rulesModal').classList.add('open');
  }

  function close() {
    stop();
    updateSpeechButton();
    $('rulesModal').classList.remove('open');
  }

  $('btnRules').addEventListener('click', open);
  $('btnCloseRules').addEventListener('click', close);
  $('rulesModal').addEventListener('click', e => {
    if (e.target.id === 'rulesModal') close();
  });

  const readBtn = $('btnReadAloud');
  if (readBtn) {
    readBtn.addEventListener('click', () => {
      if (isSpeaking()) { stop(); updateSpeechButton(); return; }
      speak(rulesSpeech(def, getDict(), getLang()), getLang(), { onEnd: updateSpeechButton });
      updateSpeechButton();
    });
  }

  // Voices arrive asynchronously on some browsers, so re-check once.
  stopVoicesListener = onVoicesReady(updateSpeechButton);
  updateSpeechButton();

  return { refresh, close, dispose: () => { stop(); if (stopVoicesListener) stopVoicesListener(); } };
}

// The markup both engines drop into their template.
export const RULES_MODAL_HTML = `
  <div id="rulesModal" class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-sheet">
      <div class="modal-header">
        <h2 id="lblRulesTitle"></h2>
        <div style="display:flex; gap:6px;">
          <button id="btnReadAloud"></button>
          <button id="btnCloseRules" aria-label="✕">✕</button>
        </div>
      </div>
      <div id="rulesBody"></div>
    </div>
  </div>
`;
