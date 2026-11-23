// Generala behaviour tests. Driven through the real UI like the Yahtzee
// suite, so they survive changes to the shared scorecard engine.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

async function withApp(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const app = await freshApp({ game: 'generala', ...opts });
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

// Option index 0 = built up (base value), 1 = servida (double).
const BUILT = 0;
const SERVIDA = 1;

// ---------- Sheet shape ----------

test('the sheet has 6 number boxes and 5 combination boxes', () => withApp(async app => {
  assert.equal(await app.sectionCount('numbers'), '0 / 6');
  assert.equal(await app.sectionCount('games'), '0 / 5');
  assert.equal(await app.sectionLabel('numbers'), 'Numbers');
  assert.equal(await app.sectionLabel('games'), 'Combinations');
}));

test('there is no upper-section bonus (that is a Yahtzee rule)', () => withApp(async app => {
  // Fill every number box with five dice: 5+10+15+20+25+30 = 105,
  // well past Yahtzee's 63 threshold. Generala awards nothing for it.
  for (const name of ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes']) {
    await app.upper(name, 5);
  }
  assert.equal(await app.total(), 105);
  assert.equal(await app.page.$('#section-numbers-bonus'), null, 'no bonus row rendered');
}));

test('number boxes score count × face', () => withApp(async app => {
  await app.upper('Threes', 4);
  assert.equal(await app.cell('Threes'), '12');
  await app.upper('Sixes', 3);
  assert.equal(await app.cell('Sixes'), '18');
  assert.equal(await app.total(), 30);
}));

// ---------- Base values and servida ----------

test('built-up combinations score 20 / 30 / 40 / 50', () => withApp(async app => {
  await app.fixed('Escalera', BUILT);
  await app.fixed('Full', BUILT);
  await app.fixed('Póker', BUILT);
  await app.fixed('Generala', BUILT);
  assert.deepEqual(
    [await app.cell('Escalera'), await app.cell('Full'), await app.cell('Póker'), await app.cell('Generala')],
    ['20', '30', '40', '50']
  );
  assert.equal(await app.total(), 140);
}));

test('servida doubles each combination: 40 / 60 / 80', () => withApp(async app => {
  await app.fixed('Escalera', SERVIDA);
  await app.fixed('Full', SERVIDA);
  await app.fixed('Póker', SERVIDA);
  assert.deepEqual(
    [await app.cell('Escalera'), await app.cell('Full'), await app.cell('Póker')],
    ['40', '60', '80']
  );
  assert.equal(await app.total(), 180);
}));

test('the entry sheet offers both options, labelled', () => withApp(async app => {
  await app.open('Full');
  const labels = await app.page.$$eval('#modalBody .quick-options button',
    bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(labels.length, 2);
  assert.match(labels[0], /Built up/);
  assert.match(labels[0], /30 pts/);
  assert.match(labels[1], /Servida/);
  assert.match(labels[1], /60 pts/);
}));

// ---------- Generala servida wins outright ----------

test('Generala servida ends the game and wins, even on fewer points', () => withApp(async app => {
  // Player 2 builds up a big score first.
  await app.selectPlayer(1);
  for (const name of ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes']) {
    await app.upper(name, 5);
  }
  await app.fixed('Póker', SERVIDA);
  assert.equal(await app.total(), 185);

  // Player 1 rolls a Generala on the first throw: 100 pts, instant win.
  await app.selectPlayer(0);
  await app.fixed('Generala', SERVIDA);
  assert.equal(await app.cell('Generala'), '100');
  assert.equal(await app.gameOverOpen(), true, 'standings open on the instant win');
  const s = await app.standings();
  assert.match(s[0], /🥇 Player 1 100 pts/, `Player 1 tops the sheet: ${JSON.stringify(s)}`);
  assert.match(s[1], /Player 2 185 pts/, 'the higher scorer is placed second');
}));

test('a built-up Generala (50) does not end the game', () => withApp(async app => {
  await app.fixed('Generala', BUILT);
  assert.equal(await app.cell('Generala'), '50');
  assert.equal(await app.gameOverOpen(), false);
}));

test('undo takes back an instant win', () => withApp(async app => {
  await app.fixed('Generala', SERVIDA);
  assert.equal(await app.gameOverOpen(), true);
  await app.standings();          // closes the sheet
  await app.undo();
  assert.equal(await app.cell('Generala'), '—');
  assert.equal(await app.gameOverOpen(), false);
}));

// ---------- Doble Generala is gated ----------

test('Doble Generala is refused until a Generala is scored', () => withApp(async app => {
  await app.tapRow('Doble Generala');
  assert.equal(await app.page.isVisible('#scoreModal.open'), false, 'entry sheet stays shut');
  assert.equal(await app.toast(), 'Score a Generala first');
  assert.equal(await app.cell('Doble Generala'), '—');
}));

test('Doble Generala opens once a Generala is on the sheet and scores 100', () => withApp(async app => {
  await app.fixed('Generala', BUILT);            // 50, no instant win
  await app.fixed('Doble Generala');
  assert.equal(await app.cell('Doble Generala'), '100');
  assert.equal(await app.total(), 150);
}));

test('a scratched Generala does not unlock Doble Generala', () => withApp(async app => {
  await app.scratch('Generala');                  // 0
  await app.tapRow('Doble Generala');
  assert.equal(await app.page.isVisible('#scoreModal.open'), false);
  assert.equal(await app.cell('Doble Generala'), '—');
}));

// ---------- Shared engine behaviour, verified for this game too ----------

test('a full sheet ends the game and shows standings', () => withApp(async app => {
  const fill = async () => {
    for (const name of ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes']) {
      await app.upper(name, 2);
    }
    await app.fixed('Escalera', BUILT);
    await app.fixed('Full', BUILT);
    await app.fixed('Póker', BUILT);
    await app.fixed('Generala', BUILT);          // 50, not servida
    await app.fixed('Doble Generala');
  };
  await fill();
  await app.selectPlayer(1);
  await fill();
  assert.equal(await app.gameOverOpen(), true);
}));

test('scores persist across reload and are kept per player', () => withApp(async app => {
  await app.fixed('Full', SERVIDA);
  await app.selectPlayer(1);
  await app.fixed('Escalera', BUILT);
  await app.reload();
  assert.equal(await app.cell('Escalera'), '20', 'still viewing Player 2');
  await app.selectPlayer(0);
  assert.equal(await app.cell('Full'), '60');
  assert.equal(await app.total(), 60);
}));

test('Generala keeps its own saved game, separate from Yahtzee', () => withApp(async app => {
  await app.fixed('Full', BUILT);
  assert.equal(await app.total(), 30);
  // Switch to Yahtzee: its sheet is untouched.
  await app.page.goto(await app.page.url().replace('#/generala', '#/yahtzee'));
  await app.page.waitForSelector('#btnLang');
  assert.equal(await app.total(), 0, 'Yahtzee sheet is empty');
  // Back to Generala: still 30.
  await app.page.goto(await app.page.url().replace('#/yahtzee', '#/generala'));
  await app.page.waitForSelector('#btnLang');
  assert.equal(await app.total(), 30);
}));

test('Spanish is the default language and translates the sheet', () => withApp({ lang: 'es' }, async app => {
  assert.equal(await app.sectionLabel('numbers'), 'Números');
  assert.equal(await app.sectionLabel('games'), 'Juegos');
  assert.equal(await app.cell('Escalera'), '—');
  await app.open('Full');
  const labels = await app.page.$$eval('#modalBody .quick-options button',
    bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  assert.match(labels[0], /Armada/);
  assert.match(labels[1], /Servida/);
}));
