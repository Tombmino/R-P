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

// Fresh phone-sized page with empty storage. Pop-ups (confirm/prompt/alert)
// are answered from a queue; by default confirm = OK.
async function freshApp({ lang = 'en', autoAdvance = false } = {}) {
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
  await page.goto(baseUrl);
  const app = makeApi(page, { dialogs, answers, errors, context });
  if (lang === 'en' && (await page.textContent('#btnLang')).startsWith('ES')) await page.click('#btnLang');
  if ((await page.isChecked('#chkAutoAdvance')) !== autoAdvance) await page.click('#chkAutoAdvance');
  return app;
}

function makeApi(page, extra) {
  const api = {
    page, ...extra,
    async close() { await extra.context.close(); },
    async reload() { await page.reload(); },
    row(title) { return page.locator('.row-item', { has: page.locator('.row-title', { hasText: title }) }); },
    async cell(title) { return (await api.row(title).locator('.row-score').textContent()).trim(); },
    async open(title) { await api.row(title).click(); await page.waitForSelector('#scoreModal.open'); },
    // Upper section: pick how many dice showed that face.
    async upper(title, count) { await api.open(title); await page.click(`#modalBody .die-btn:nth-child(${count + 1})`); },
    // Fixed categories (Full House, straights, Yahtzee): tap the score button.
    async fixed(title) { await api.open(title); await page.click('#modalBody button.primary'); },
    // Sum categories (3/4 of a kind, Chance): type a number and Save.
    async sum(title, value) { await api.open(title); await page.fill('#modalBody input', String(value)); await page.click('#modalBody button.primary'); },
    async scratch(title) { await api.open(title); await page.click('#btnZeroScore'); },
    async clear(title) { await api.open(title); await page.click('#btnClearScore'); },
    async total() { return Number(await page.textContent('#grandTotalVal')); },
    async text(sel) { return (await page.textContent(sel)).trim(); },
    async activePlayer() { return api.text('#activePlayerLabel'); },
    async selectPlayer(i) { await page.click(`#playersBar .player-tab:nth-child(${i + 1})`); },
    async playerCount() { return page.locator('#playersBar .player-tab').count(); },
    async addPlayer() { await page.click('#btnAddPlayer'); },
    async rename(name) { extra.answers.push(name); await page.click('#btnRenamePlayer'); },
    async undo() { await page.click('#btnDockUndo'); },
    async saveGame() { await page.click('#btnFinishGame'); },
    async history() {
      await page.click('#btnHistory');
      const cards = await page.locator('#historyList .history-card').allTextContents();
      await page.click('#btnCloseHistory');
      return cards.map(s => s.replace(/\s+/g, ' ').trim());
    },
    async standings() {
      await page.click('#btnLeaderboard');
      // Each row is "<medal + name>" and "<points>" in two parts; join with a space.
      const rows = await page.$$eval('#leaderboardList .leaderboard-item',
        items => items.map(i => [...i.children].map(c => c.textContent.trim()).join(' ')));
      await page.click('#btnCloseLeaderboard');
      return rows.map(s => s.replace(/\s+/g, ' ').trim());
    },
    // Fill a player's whole card quickly with a fixed set of scores.
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
