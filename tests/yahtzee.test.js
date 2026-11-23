// Yahtzee behaviour tests. They drive the real app in a headless browser,
// so they keep working when the code underneath is reorganised.
//
// Tests marked { todo: 'KNOWN BUG …' } describe how the app SHOULD behave.
// They currently fail on purpose; each one turns green when its bug is fixed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

async function withApp(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const app = await freshApp(opts);
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

// ---------- Scoring ----------

test('upper section: each box scores count × face', () => withApp(async app => {
  const faces = [['Ones', 1], ['Twos', 2], ['Threes', 3], ['Fours', 4], ['Fives', 5], ['Sixes', 6]];
  for (const [title, face] of faces) {
    for (const count of [0, 1, 5]) {
      await app.upper(title, count);
      assert.equal(await app.cell(title), String(count * face), `${title} with ${count} dice`);
    }
  }
}));

test('upper bonus: 62 gives no bonus, 63 gives +35', () => withApp(async app => {
  await app.upper('Ones', 2); await app.upper('Twos', 3); await app.upper('Threes', 3);
  await app.upper('Fours', 3); await app.upper('Fives', 3); await app.upper('Sixes', 3);
  assert.equal(await app.sectionSubtotal('upper'), '62');
  assert.equal(await app.sectionBonus('upper'), '0');
  assert.equal(await app.sectionProgress('upper'), '1 pts needed for +35 bonus');
  assert.equal(await app.total(), 62);

  await app.upper('Ones', 3);
  assert.equal(await app.sectionSubtotal('upper'), '63');
  assert.equal(await app.sectionBonus('upper'), '+35');
  assert.equal(await app.total(), 98);
}));

test('fixed boxes: Full House 25, Small 30, Large 40, Yahtzee 50', () => withApp(async app => {
  await app.fixed('Full House'); await app.fixed('Small Straight');
  await app.fixed('Large Straight'); await app.fixed('Yahtzee');
  assert.deepEqual([await app.cell('Full House'), await app.cell('Small Straight'), await app.cell('Large Straight'), await app.cell('Yahtzee')], ['25', '30', '40', '50']);
  assert.equal(await app.total(), 145);
}));

test('sum boxes: typed value and quick buttons both work', () => withApp(async app => {
  await app.sum('Three of a Kind', 17);
  assert.equal(await app.cell('Three of a Kind'), '17');
  await app.open('Chance'); await app.page.click('#modalBody .numpad button:has-text("24 pts")');
  assert.equal(await app.cell('Chance'), '24');
  assert.equal(await app.total(), 41);
}));

test('scratch sets 0, clear empties the box', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.scratch('Yahtzee');
  assert.equal(await app.cell('Yahtzee'), '0');
  await app.clear('Yahtzee');
  assert.equal(await app.cell('Yahtzee'), '—');
  assert.equal(await app.sectionCount('lower'), '0 / 7');
}));

test('extra Yahtzee bonus adds 100 each, minus button removes', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.extraPlus('extraYahtzee'); await app.extraPlus('extraYahtzee');
  assert.equal(await app.total(), 250);
  await app.extraMinus('extraYahtzee');
  assert.equal(await app.total(), 150);
  await app.extraMinus('extraYahtzee'); await app.extraMinus('extraYahtzee');
  assert.equal(await app.extraCount('extraYahtzee'), '0', 'never goes below 0');
}));

test('perfect card totals 375', () => withApp(async app => {
  await app.fillCard({ ones: 5, twos: 5, threes: 5, fours: 5, fives: 5, sixes: 5, tk: 30, fk: 30, ch: 30 });
  assert.equal(await app.total(), 375);
  assert.equal(await app.sectionCount('upper'), '6 / 6');
  assert.equal(await app.sectionCount('lower'), '7 / 7');
}));

// ---------- Turns and players ----------

test('auto-advance moves to the next player after scoring', () => withApp({ autoAdvance: true }, async app => {
  assert.equal(await app.activePlayer(), 'Player 1');
  await app.fixed('Yahtzee');
  assert.equal(await app.activePlayer(), 'Player 2');
  assert.match(await app.text('#toast'), /Player 2's turn/);
  await app.fixed('Yahtzee');
  assert.equal(await app.activePlayer(), 'Player 1', 'wraps around');
}));

test('auto-advance off: stays on the same player', () => withApp(async app => {
  await app.fixed('Yahtzee');
  assert.equal(await app.activePlayer(), 'Player 1');
}));

test('clearing a box does not advance the turn', () => withApp({ autoAdvance: true }, async app => {
  await app.clear('Chance');
  assert.equal(await app.activePlayer(), 'Player 1');
}));

test('players: add up to 6, then blocked', () => withApp(async app => {
  for (let i = 0; i < 4; i++) await app.addPlayer();
  assert.equal(await app.playerCount(), 6);
  assert.equal(await app.activePlayer(), 'Player 6', 'new player becomes active');
  await app.addPlayer();
  assert.equal(await app.playerCount(), 6);
  assert.equal(app.dialogs.at(-1).message, 'Maximum 6 players in this version.');
}));

test('players: rename and remove; last player cannot be removed', () => withApp(async app => {
  await app.rename('Ana');
  assert.equal(await app.activePlayer(), 'Ana');
  await app.rename('A very long name that goes on');
  assert.equal(await app.activePlayer(), 'A very long name t', 'cut to 18 characters');
  await app.page.click('#btnRemovePlayer');
  assert.equal(await app.playerCount(), 1);
  assert.equal(await app.page.isDisabled('#btnRemovePlayer'), true);
}));

test('each player keeps their own card', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.selectPlayer(1);
  assert.equal(await app.cell('Yahtzee'), '—');
  await app.fixed('Full House');
  await app.selectPlayer(0);
  assert.equal(await app.total(), 50);
  assert.deepEqual(await app.standings(), ['🥇 Player 1 50 pts', '🥈 Player 2 25 pts']);
}));

// ---------- Undo and reset ----------

test('undo restores the score and whose turn it was', () => withApp({ autoAdvance: true }, async app => {
  assert.equal(await app.page.isDisabled('#btnDockUndo'), true);
  await app.fixed('Yahtzee');
  assert.equal(await app.activePlayer(), 'Player 2');
  await app.undo();
  assert.equal(await app.activePlayer(), 'Player 1');
  assert.equal(await app.cell('Yahtzee'), '—');
  assert.equal(await app.total(), 0);
}));

test('reset clears every score but keeps the players', () => withApp(async app => {
  await app.rename('Ana');
  await app.fixed('Yahtzee');
  await app.selectPlayer(1); await app.fixed('Full House');
  await app.page.click('#btnReset');
  assert.equal(await app.activePlayer(), 'Ana');
  assert.equal(await app.total(), 0);
  assert.deepEqual(await app.standings(), ['🥇 Ana 0 pts', '🥈 Player 2 0 pts']);
}));

// ---------- History ----------

test('save game: adds to history and clears the board', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.selectPlayer(1); await app.fixed('Full House');
  await app.saveGame();
  assert.equal(await app.total(), 0);
  const h = await app.history();
  assert.equal(h.length, 1);
  assert.match(h[0], /🏆 Player 1 — 50 pts/);
  // Standings chips now use medals (🥇/🥈/🥉) instead of #N so the
  // history card reads the same as the live leaderboard.
  assert.match(h[0], /🥈 Player 2: 25/);
}));

test('save game with no scores is refused', () => withApp(async app => {
  await app.openSave();
  assert.equal(await app.saveSheetOpen(), false, 'the sheet does not even open');
  assert.equal(await app.toast(), 'No scores entered yet to save.');
  assert.equal((await app.history()).length, 0);
}));

// ---------- Language and theme ----------

test('language switch translates the screen and default player names only', () => withApp(async app => {
  await app.rename('Ana');
  await app.page.click('#btnLang');                       // to Spanish
  assert.equal(await app.sectionLabel('upper'), 'Sección Superior');
  assert.equal(await app.text('#btnLang'), 'ES 🇪🇸');
  assert.deepEqual(await app.standings(), ['🥇 Ana 0 pts', '🥈 Jugador 2 0 pts']);
  assert.equal(await app.page.getAttribute('html', 'lang'), 'es');
}));

test('theme switch toggles dark mode', () => withApp(async app => {
  assert.equal(await app.page.evaluate(() => document.body.classList.contains('dark')), false);
  await app.page.click('#btnTheme');
  assert.equal(await app.page.evaluate(() => document.body.classList.contains('dark')), true);
}));

// ---------- Saving on the device ----------

test('closing and reopening keeps scores, players, language, theme and turn', () => withApp(async app => {
  await app.rename('Ana');
  await app.fixed('Yahtzee');          // Ana (view=turn=0) scores 50
  await app.selectPlayer(1);           // start viewing P2 — turn stays with Ana
  await app.page.click('#btnTheme');
  await app.reload();
  // Turn stays with Ana because selectPlayer only moves the view.
  assert.equal(await app.activePlayer(), 'Ana');
  // The card on screen should still be P2's (empty).
  assert.equal(await app.cell('Yahtzee'), '—');
  await app.selectPlayer(0);
  assert.equal(await app.cell('Yahtzee'), '50');
  assert.equal(await app.total(), 50);
  assert.equal(await app.text('#btnLang'), 'EN 🇺🇸');
  assert.equal(await app.page.evaluate(() => document.body.classList.contains('dark')), true);
}));

test('damaged saved data falls back to a new game instead of crashing', () => withApp(async app => {
  await app.page.evaluate(() => localStorage.setItem('sk.yahtzee.state', '{not json'));
  await app.reload();
  assert.equal(await app.playerCount(), 2);
  assert.equal(await app.total(), 0);
}));

// ---------- Previously-known bugs, now fixed ----------
// These were marked { todo: 'KNOWN BUG N' } before the fix; the markers
// are removed so they count as regular tests going forward.

test('BUG 1 fix: correcting an earlier player\'s box keeps the turn where it was', () => withApp({ autoAdvance: true }, async app => {
  await app.addPlayer();                     // 3 players; adding makes Player 3 active
  await app.selectPlayer(0);
  await app.fixed('Yahtzee');                // P1 scores -> P2's turn
  await app.fixed('Yahtzee');                // P2 scores -> P3's turn
  await app.selectPlayer(0);                 // look back at P1 to fix a mistake
  await app.scratch('Yahtzee');
  assert.equal(await app.activePlayer(), 'Player 3', 'should still be Player 3\'s turn');
}));

test('BUG 2 fix: undoing a saved game does not leave a duplicate in history', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.saveGame();
  await app.undo();                          // undo the save: scores come back
  assert.equal(await app.total(), 50);
  await app.saveGame();                      // save again
  assert.equal((await app.history()).length, 1, 'the same game should appear once');
}));

test('BUG 3 fix: typed scores above 30 are rejected for sum boxes', () => withApp(async app => {
  await app.sum('Chance', 99);
  assert.notEqual(await app.cell('Chance'), '99');
}));

test('BUG 4 fix: extra Yahtzee bonus needs a 50 in the Yahtzee box', () => withApp(async app => {
  await app.extraPlus('extraYahtzee');      // Yahtzee box empty
  assert.equal(await app.total(), 0, 'not allowed with empty Yahtzee box');
  await app.scratch('Yahtzee');
  await app.extraPlus('extraYahtzee');      // Yahtzee box scratched
  assert.equal(await app.total(), 0, 'not allowed with scratched Yahtzee box');
}));

test('BUG 5 fix: the game ends and shows final standings when every card is full', () => withApp(async app => {
  await app.fillCard();
  await app.selectPlayer(1);
  await app.fillCard();
  assert.equal(await app.gameOverOpen(), true);
}));

test('BUG 6 fix: a tie shows joint winners', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.selectPlayer(1); await app.fixed('Yahtzee');
  const s = await app.standings();
  assert.ok(s[0].startsWith('🥇') && s[1].startsWith('🥇'), `both first: ${JSON.stringify(s)}`);
  await app.saveGame();
  const h = await app.history();
  assert.match(h[0], /Player 1/); assert.match(h[0].split('—')[0], /Player 2/, 'history names both winners');
}));

test('home button returns to the game chooser, and reopening Yahtzee resumes the game', () => withApp(async app => {
  await app.fixed('Yahtzee');
  assert.equal(await app.total(), 50);
  await app.page.click('#btnHome');
  // Back on the home screen the game chooser shows the Yahtzee card again.
  await app.page.waitForSelector('a.game-card:not(.coming-soon)');
  assert.equal(await app.page.$('#btnLang'), null, 'game chrome is gone');
  // Re-entering Yahtzee: score is still there.
  await app.page.click('a.game-card:not(.coming-soon)');
  await app.page.waitForSelector('#btnLang');
  assert.equal(await app.total(), 50);
}));

test('undo persists across reload', () => withApp(async app => {
  await app.fixed('Yahtzee');
  await app.reload();
  assert.equal(await app.page.isDisabled('#btnDockUndo'), false);
}));
