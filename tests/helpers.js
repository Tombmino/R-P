// Shared test helpers: a tiny local web server + a real (headless) Chrome
// that taps through the app the way a player would.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const APP_DIR = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css', '.png': 'image/png' };

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(APP_DIR, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(APP_DIR) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let browser, server, baseUrl;

async function setup() {
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
}

async function teardown() {
  await browser?.close();
  server?.close();
}

// Fresh phone-sized page with empty storage, landed on one game's screen.
// Pop-ups (confirm/prompt/alert) are answered from a queue; confirm = OK.
async function freshApp({ game = 'yahtzee', lang = 'en', autoAdvance = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const dialogs = [];          // what the app showed
  const answers = [];          // queued answers for prompt()
  page.on('dialog', async d => {
    dialogs.push({ type: d.type(), message: d.message() });
    if (d.type() === 'prompt') return d.accept(answers.length ? answers.shift() : d.defaultValue());
    return d.accept();
  });
  await page.goto(`${baseUrl}#/${game}`);
  // Game screens expose #btnLang; the home screen shows game cards.
  await page.waitForSelector(game ? '#btnLang, .game-card' : '.game-card');
  const app = makeApi(page, { dialogs, answers, errors, context, game });
  if (await page.$('#btnLang')) {
    if (lang === 'en' && (await page.textContent('#btnLang')).startsWith('ES')) await page.click('#btnLang');
  }
  const toggle = await page.$('#chkAutoAdvance');
  if (toggle && (await page.isChecked('#chkAutoAdvance')) !== autoAdvance) await page.click('#chkAutoAdvance');
  return app;
}

function makeApi(page, extra) {
  const api = {
    page, ...extra,
    async close() { await extra.context.close(); },
    async reload() { await page.reload(); await page.waitForSelector('#btnLang'); },

    // ---- score sheet rows ----
    // Prefer an exact title match, falling back to a substring match.
    // Needed because some names contain others: Generala's "Generala"
    // and "Doble Generala", while Yahtzee's row reads "Ones (Aces)" and
    // the tests ask for "Ones".
    async row(title) {
      const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exact = page.locator('.row-item', {
        has: page.locator('.row-title', { hasText: new RegExp(`^${esc}$`) })
      });
      if (await exact.count() === 1) return exact;
      return page.locator('.row-item', {
        has: page.locator('.row-title', { hasText: title })
      }).first();
    },
    async cell(title) { return ((await (await api.row(title)).locator('.row-score').textContent())).trim(); },
    async open(title) { await (await api.row(title)).click(); await page.waitForSelector('#scoreModal.open'); },
    // Upper/face boxes: pick how many dice showed that face.
    async upper(title, count) { await api.open(title); await page.click(`#modalBody .die-btn:nth-child(${count + 1})`); },
    // Option boxes (fixed values; Generala has two — normal and servida).
    async fixed(title, optionIndex = 0) {
      await api.open(title);
      await page.click(`#modalBody .quick-options button:nth-child(${optionIndex + 1})`);
    },
    // Free-entry boxes: type a number and Save.
    async sum(title, value) { await api.open(title); await page.fill('#modalBody input', String(value)); await page.click('#modalBody button.primary'); },
    async scratch(title) { await api.open(title); await page.click('#btnZeroScore'); },
    async clear(title) { await api.open(title); await page.click('#btnClearScore'); },
    // Tapping a gated box shows a toast and never opens the sheet.
    async tapRow(title) { await (await api.row(title)).click(); },

    // ---- section + extras readouts (engine id scheme) ----
    async sectionCount(id) { return api.text(`#section-${id}-count`); },
    async sectionLabel(id) { return api.text(`#section-${id}-label`); },
    async sectionSubtotal(id) { return api.text(`#section-${id}-subtotal`); },
    async sectionBonus(id) { return api.text(`#section-${id}-bonus`); },
    async sectionProgress(id) { return api.text(`#section-${id}-progress`); },
    async extraCount(id) { return api.text(`#extra-${id}-count`); },
    async extraPlus(id) { await page.click(`#extra-${id}-plus`); },
    async extraMinus(id) { await page.click(`#extra-${id}-minus`); },

    // ---- running-total games (Farkle, Truco) ----
    async pending() { return Number(await api.text('#pendingVal')); },
    async addPreset(v) { await page.click(`#presetGrid [data-add="${v}"]`); },
    async typeAmount(v) { await page.fill('#typedAmount', String(v)); await page.click('#btnAddTyped'); },
    async action(id) { await page.click(`#action-${id}`); },
    sideRow(i) { return page.locator('#sidesList .side-row').nth(i); },
    async sideCount() { return page.locator('#sidesList .side-row').count(); },
    async sideTotal(i) {
      const txt = await api.sideRow(i).locator('.side-total-num, .tally-num').first().textContent();
      return Number(txt.trim());
    },
    async sideName(i) { return (await api.sideRow(i).locator('.row-title').textContent()).trim(); },
    async turnChips(i) { return api.sideRow(i).locator('.turn-chip').allTextContents(); },
    async activeSide() {
      const n = await api.sideCount();
      for (let i = 0; i < n; i++) {
        const cls = await api.sideRow(i).getAttribute('class');
        if (cls.includes('side-active')) return i;
      }
      return -1;
    },
    async selectSide(i) { await api.sideRow(i).click(); },
    async tallySticks(i) { return api.sideRow(i).locator('.tally-stick').count(); },
    async hasMilestone(i) { return api.sideRow(i).locator('.milestone-chip').count(); },

    // ---- general ----
    async total() { return Number(await page.textContent('#grandTotalVal')); },
    async text(sel) { return (await page.textContent(sel)).trim(); },
    async toast() { return api.text('#toast'); },
    async activePlayer() { return api.text('#activePlayerLabel'); },
    async selectPlayer(i) { await page.click(`#playersBar .player-tab:nth-child(${i + 1})`); },
    async playerCount() { return page.locator('#playersBar .player-tab').count(); },
    async addPlayer() { await page.click('#btnAddPlayer'); },
    async rename(name) {
      await page.click('#btnRenamePlayer');
      await page.waitForSelector('#playerModal.open');
      await page.fill('#playerNameInput', name);
      await page.click('#btnSavePlayer');
    },
    async setColor(colorId) {
      await page.click('#btnRenamePlayer');
      await page.waitForSelector('#playerModal.open');
      await page.click(`#colorRow .swatch[data-color="${colorId}"]`);
      await page.click('#btnSavePlayer');
    },
    async screenColor() {
      const cls = (await page.getAttribute('body', 'class')) || '';
      const m = cls.match(/\bpc-([a-z]+)\b/);
      return m ? m[1] : null;
    },
    async playerDot(i) {
      const cls = await page.locator('#playersBar .player-tab').nth(i).locator('.player-dot').getAttribute('class');
      return (cls.match(/pc-([a-z]+)/) || [])[1] || null;
    },
    async sideDot(i) {
      const cls = await api.sideRow(i).locator('.player-dot').getAttribute('class');
      return (cls.match(/pc-([a-z]+)/) || [])[1] || null;
    },
    async undo() { await page.click('#btnDockUndo'); },
    async saveGame() { await page.click('#btnFinishGame'); },
    async history() {
      await page.click('#btnHistory');
      const cards = await page.locator('#historyList .history-card').allTextContents();
      await page.click('#btnCloseHistory');
      return cards.map(s => s.replace(/\s+/g, ' ').trim());
    },
    async standings() {
      // Each row is "<medal + name>" and "<points>" in two parts.
      const open = await page.$('#leaderboardModal.open');
      if (!open) await page.click('#btnLeaderboard');
      const rows = await page.$$eval('#leaderboardList .leaderboard-item',
        items => items.map(i => [...i.children].map(c => c.textContent.trim()).join(' ')));
      await page.click('#btnCloseLeaderboard');
      return rows.map(s => s.replace(/\s+/g, ' ').trim());
    },
    async gameOverOpen() { return page.isVisible('#leaderboardModal.open'); },

    // Fill a Yahtzee card quickly with a fixed set of scores.
    async fillCard(p = {}) {
      const s = { ones: 3, twos: 3, threes: 3, fours: 3, fives: 3, sixes: 3, tk: 20, fk: 20, ch: 20, ...p };
      await api.upper('Ones', s.ones); await api.upper('Twos', s.twos); await api.upper('Threes', s.threes);
      await api.upper('Fours', s.fours); await api.upper('Fives', s.fives); await api.upper('Sixes', s.sixes);
      await api.sum('Three of a Kind', s.tk); await api.sum('Four of a Kind', s.fk);
      await api.fixed('Full House'); await api.fixed('Small Straight'); await api.fixed('Large Straight');
      await api.fixed('Yahtzee'); await api.sum('Chance', s.ch);
    }
  };
  return api;
}

module.exports = { setup, teardown, freshApp };
