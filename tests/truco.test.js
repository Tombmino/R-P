// Truco behaviour tests, driven through the real UI.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

async function withApp(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const app = await freshApp({ game: 'truco', ...opts });
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

// ---------- Setup ----------

test('two sides named Nosotros and Ellos, both on zero', () => withApp(async app => {
  assert.equal(await app.sideCount(), 2);
  assert.equal(await app.sideName(0), 'Nosotros');
  assert.equal(await app.sideName(1), 'Ellos');
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.sideTotal(1), 0);
}));

test('a third side can be added for 1v1v1, but no more', () => withApp(async app => {
  await app.addPlayer();
  assert.equal(await app.sideCount(), 3);
  assert.equal(await app.page.isDisabled('#btnAddPlayer'), true, 'capped at 3');
}));

test('there is no pending box — a hand is recorded straight away', () => withApp(async app => {
  assert.equal(await app.page.$('#pendingVal'), null);
  await app.addPreset(2);
  assert.equal(await app.sideTotal(0), 2, 'committed on the tap');
}));

test('the target is stated as 30, split into malas and buenas', () => withApp(async app => {
  assert.match(await app.text('#targetLabel'), /To 30/);
  assert.match(await app.text('#targetLabel'), /15 malas then 15 buenas/);
  assert.match(await app.text('#lblTarget'), /To 30/);
}));

// ---------- Scoring a hand ----------

test('the chips cover 1 to 6 — every ordinary call', () => withApp(async app => {
  const chips = await app.page.$$eval('#presetGrid [data-add]', bs => bs.map(b => b.dataset.add));
  assert.deepEqual(chips, ['1', '2', '3', '4', '5', '6']);
}));

test('points add up for the selected side only', () => withApp(async app => {
  await app.addPreset(2);     // truco
  await app.addPreset(3);     // retruco
  assert.equal(await app.sideTotal(0), 5);
  assert.equal(await app.sideTotal(1), 0);
}));

test('scoring does not pass to the other side', () => withApp(async app => {
  assert.equal(await app.activeSide(), 0);
  await app.addPreset(4);
  assert.equal(await app.activeSide(), 0, 'Nosotros stays selected');
}));

test('tapping the other side scores for them instead', () => withApp(async app => {
  await app.addPreset(2);
  await app.selectSide(1);
  await app.addPreset(6);     // contra flor
  assert.equal(await app.sideTotal(0), 2);
  assert.equal(await app.sideTotal(1), 6);
}));

test('falta envido is typed, since it is worth whatever is left', () => withApp(async app => {
  await app.typeAmount(13);
  assert.equal(await app.sideTotal(0), 13);
}));

test('more than 30 in one go is refused', () => withApp(async app => {
  await app.typeAmount(31);
  assert.equal(await app.sideTotal(0), 0);
  assert.match(await app.toast(), /max 30/i);
}));

// ---------- Toothpicks ----------

test('points are drawn as one toothpick each', () => withApp(async app => {
  await app.addPreset(1);
  assert.equal(await app.tallySticks(0), 1);
  await app.addPreset(3);
  assert.equal(await app.tallySticks(0), 4);
  await app.addPreset(1);
  assert.equal(await app.tallySticks(0), 5);
}));

test('toothpicks are grouped in fives, the fifth crossing the other four', () => withApp(async app => {
  await app.addPreset(5);
  const groups = await app.sideRow(0).locator('.tally-group').count();
  assert.equal(groups, 1, 'five points is one group');
  const full = await app.sideRow(0).locator('.tally-group.of-five').count();
  assert.equal(full, 1, 'and it is marked as a complete group of five');

  await app.addPreset(2);
  assert.equal(await app.sideRow(0).locator('.tally-group').count(), 2);
  assert.equal(await app.sideRow(0).locator('.tally-group.of-five').count(), 1,
    'the second group is incomplete');
  assert.equal(await app.tallySticks(0), 7);
}));

test('the numeral is shown alongside the toothpicks', () => withApp(async app => {
  await app.addPreset(4);
  await app.addPreset(3);
  assert.equal(await app.sideTotal(0), 7, 'read from the numeral');
}));

test('malas and buenas are separated by a line once past 15', () => withApp(async app => {
  await app.typeAmount(14);
  assert.equal(await app.sideRow(0).locator('.tally-split').count(), 0, 'still in the malas');
  assert.equal(await app.hasMilestone(0), 0, 'no buenas marker yet');

  await app.addPreset(1);     // 15 exactly — malas complete
  assert.equal(await app.hasMilestone(0), 1, 'buenas marker appears at 15');

  await app.addPreset(2);     // 17 — into the buenas
  assert.equal(await app.sideRow(0).locator('.tally-split').count(), 1, 'divider drawn');
  assert.equal(await app.tallySticks(0), 17);
}));

// ---------- Winning ----------

test('reaching 30 ends the game and shows the winner', () => withApp(async app => {
  await app.typeAmount(15);
  await app.typeAmount(15);
  assert.equal(await app.sideTotal(0), 30);
  assert.equal(await app.gameOverOpen(), true);
  const s = await app.standings();
  assert.match(s[0], /🥇 Nosotros 30 pts/);
  assert.match(s[1], /Ellos 0 pts/);
}));

test('29 is not a win', () => withApp(async app => {
  await app.typeAmount(15);
  await app.typeAmount(14);
  assert.equal(await app.sideTotal(0), 29);
  assert.equal(await app.gameOverOpen(), false);
}));

test('there is no final round — the first side to 30 takes it', () => withApp(async app => {
  await app.selectSide(1);
  await app.typeAmount(20);     // Ellos on 20
  await app.selectSide(0);
  await app.typeAmount(15);
  await app.typeAmount(15);     // Nosotros reach 30 first
  assert.equal(await app.gameOverOpen(), true);
  const s = await app.standings();
  assert.match(s[0], /🥇 Nosotros 30 pts/);
}));

// ---------- Engine behaviour for this game ----------

test('undo takes back the last hand', () => withApp(async app => {
  await app.addPreset(3);
  await app.addPreset(4);
  assert.equal(await app.sideTotal(0), 7);
  await app.undo();
  assert.equal(await app.sideTotal(0), 3);
  assert.equal(await app.tallySticks(0), 3);
}));

test('sides can be renamed for a head-to-head', () => withApp(async app => {
  await app.rename('Tomás');
  assert.equal(await app.sideName(0), 'Tomás');
  await app.selectSide(1);
  await app.rename('Abuelo');
  assert.equal(await app.sideName(1), 'Abuelo');
}));

test('the score survives a reload', () => withApp(async app => {
  await app.addPreset(6);
  await app.selectSide(1);
  await app.addPreset(2);
  await app.reload();
  assert.equal(await app.sideTotal(0), 6);
  assert.equal(await app.sideTotal(1), 2);
  assert.equal(await app.activeSide(), 1, 'the selected side is remembered');
}));

test('saving files the game in history and clears the board', () => withApp(async app => {
  await app.addPreset(5);
  await app.selectSide(1);
  await app.addPreset(3);
  await app.saveGame();
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.tallySticks(0), 0);
  const h = await app.history();
  assert.match(h[0], /🏆 Nosotros — 5 pts/);
}));

test('reset clears the toothpicks but keeps the side names', () => withApp(async app => {
  await app.rename('Los pibes');
  await app.addPreset(4);
  await app.page.click('#btnReset');
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.sideName(0), 'Los pibes');
}));

test('Truco carries its own accent', () => withApp(async app => {
  const cls = await app.page.getAttribute('body', 'class');
  assert.match(cls, /game-truco/);
}));

test('Spanish wording for the sheet', () => withApp({ lang: 'es' }, async app => {
  assert.equal(await app.text('#lblEntry'), 'Puntos de la mano');
  assert.match(await app.text('#targetLabel'), /30 · 15 malas, 15 buenas/);
  await app.typeAmount(15);
  assert.match(await app.sideRow(0).textContent(), /Buenas/);
}));

test('the header says who you are scoring for, not whose turn it is', () => withApp(async app => {
  assert.equal(await app.text('#lblActivePlayer'), 'Scoring for:');
  assert.equal(await app.activePlayer(), 'Nosotros');
  await app.selectSide(1);
  assert.equal(await app.activePlayer(), 'Ellos');
}));

test('the dock names the side it is showing', () => withApp(async app => {
  await app.addPreset(4);
  assert.equal(await app.text('#lblGrandTotal'), 'Nosotros');
  assert.equal(await app.total(), 4);
}));
