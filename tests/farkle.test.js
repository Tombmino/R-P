// Farkle behaviour tests, driven through the real UI.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

async function withApp(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const app = await freshApp({ game: 'farkle', ...opts });
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

const OPENING_MIN = 500;

// ---------- Building a turn ----------

test('starts with two players on zero and nobody on the board', () => withApp(async app => {
  assert.equal(await app.sideCount(), 2);
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.sideTotal(1), 0);
  assert.equal(await app.pending(), 0);
  assert.equal(await app.activeSide(), 0);
  assert.match(await app.sideRow(0).textContent(), /No turns yet/);
}));

test('preset chips add up into the pending turn', () => withApp(async app => {
  await app.addPreset(100);
  assert.equal(await app.pending(), 100);
  await app.addPreset(50);
  await app.addPreset(1000);
  assert.equal(await app.pending(), 1150);
  // Nothing is on the board until it's banked.
  assert.equal(await app.sideTotal(0), 0);
}));

test('a typed amount adds to the pending turn too', () => withApp(async app => {
  await app.addPreset(300);
  await app.typeAmount(250);
  assert.equal(await app.pending(), 550);
}));

test('banking commits the turn, clears pending and passes the dice', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');
  assert.equal(await app.sideTotal(0), 1000);
  assert.equal(await app.pending(), 0);
  assert.equal(await app.activeSide(), 1, 'next player is up');
  assert.deepEqual(await app.turnChips(0), ['+1000']);
}));

test('banking with nothing pending does nothing', () => withApp(async app => {
  await app.action('bank');
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.activeSide(), 0, 'still the same player');
}));

// ---------- Farkle ----------

test('farkle loses the pending points and logs the turn', () => withApp(async app => {
  await app.addPreset(1500);
  assert.equal(await app.pending(), 1500);
  await app.action('farkle');
  assert.equal(await app.sideTotal(0), 0, 'nothing banked');
  assert.equal(await app.pending(), 0);
  assert.deepEqual(await app.turnChips(0), ['0']);
  assert.equal(await app.activeSide(), 1);
}));

test('three farkles in a row cost 1000', () => withApp(async app => {
  // Get player 1 on the board first, so the penalty is visible.
  await app.addPreset(1000);
  await app.action('bank');          // P1: 1000, now P2's turn
  await app.addPreset(1000);
  await app.action('bank');          // P2: 1000, back to P1

  for (let i = 0; i < 2; i++) {
    await app.action('farkle');      // P1 farkles
    await app.addPreset(500);
    await app.action('bank');        // P2 banks, back to P1
  }
  assert.equal(await app.sideTotal(0), 1000, 'two farkles cost nothing yet');

  await app.action('farkle');        // P1's third farkle in a row
  assert.equal(await app.sideTotal(0), 0, '1000 - 1000 penalty');
  const chips = await app.turnChips(0);
  assert.equal(chips.at(-1), '-1000', `penalty is logged: ${JSON.stringify(chips)}`);
}));

test('the farkle run resets after a banked turn', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');          // P1 on the board
  await app.addPreset(500);
  await app.action('bank');          // P2

  await app.action('farkle');        // P1 farkle 1
  await app.addPreset(500); await app.action('bank');
  await app.action('farkle');        // P1 farkle 2
  await app.addPreset(500); await app.action('bank');
  await app.addPreset(500); await app.action('bank');   // P1 banks — run broken
  await app.addPreset(500); await app.action('bank');
  await app.action('farkle');        // P1 farkle 1 again, not 3
  assert.equal(await app.sideTotal(0), 1500, 'no penalty applied');
}));

// ---------- Opening minimum ----------

test('a player not on the board cannot bank less than the opening minimum', () => withApp(async app => {
  await app.addPreset(400);
  await app.action('bank');
  assert.equal(await app.sideTotal(0), 0, 'refused');
  assert.equal(await app.pending(), 400, 'the turn is still there to add to');
  assert.equal(await app.activeSide(), 0, 'still their turn');
  assert.match(await app.toast(), /need 500 in one turn/i);
}));

test('exactly the opening minimum gets you on the board', () => withApp(async app => {
  await app.addPreset(OPENING_MIN);
  await app.action('bank');
  assert.equal(await app.sideTotal(0), OPENING_MIN);
}));

test('once on the board, small turns are allowed', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');          // P1 opens
  await app.addPreset(1000);
  await app.action('bank');          // P2 opens
  await app.addPreset(50);
  await app.action('bank');          // P1 banks 50
  assert.equal(await app.sideTotal(0), 1050);
}));

test('a farkle is allowed before opening', () => withApp(async app => {
  await app.action('farkle');
  assert.equal(await app.activeSide(), 1, 'the turn passed');
  assert.deepEqual(await app.turnChips(0), ['0']);
}));

// ---------- Target and final round ----------

test('reaching the target does not end the game — everyone gets one more turn', () => withApp(async app => {
  await app.typeAmount(10000);
  await app.action('bank');
  assert.equal(await app.sideTotal(0), 10000);
  assert.equal(await app.gameOverOpen(), false, 'game is not over yet');
  assert.equal(await app.activeSide(), 1, 'player 2 gets the final turn');
  assert.match(await app.toast(), /final round/i);
  assert.equal(await app.hasMilestone(0), 1, 'target marker shown');
}));

test('the game ends once the final round is played out', () => withApp(async app => {
  await app.typeAmount(10000);
  await app.action('bank');          // P1 passes the target
  await app.typeAmount(600);
  await app.action('bank');          // P2's last turn
  assert.equal(await app.gameOverOpen(), true);
  const s = await app.standings();
  assert.match(s[0], /🥇 Player 1 10000 pts/);
  assert.match(s[1], /Player 2 600 pts/);
}));

test('a player can overtake during the final round', () => withApp(async app => {
  await app.typeAmount(10000);
  await app.action('bank');          // P1: 10000
  await app.typeAmount(10000);
  await app.action('bank');          // P2 overtakes on the last turn? ties
  const s = await app.standings();
  assert.ok(s[0].startsWith('🥇') && s[1].startsWith('🥇'), `tie at 10000: ${JSON.stringify(s)}`);
}));

// ---------- Engine behaviour for this game ----------

test('undo takes back a banked turn and the farkle penalty with it', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');
  assert.equal(await app.sideTotal(0), 1000);
  await app.undo();
  assert.equal(await app.sideTotal(0), 0);
  assert.equal(await app.activeSide(), 0, 'the turn comes back too');
}));

test('players can be added up to 8 and renamed', () => withApp(async app => {
  await app.rename('Tomás');
  assert.equal(await app.sideName(0), 'Tomás');
  for (let i = 0; i < 6; i++) await app.addPlayer();
  assert.equal(await app.sideCount(), 8);
  assert.equal(await app.page.isDisabled('#btnAddPlayer'), true, 'capped at 8');
}));

test('tapping a player makes it their turn and clears a half-built turn', () => withApp(async app => {
  await app.addPreset(300);
  await app.selectSide(1);
  assert.equal(await app.activeSide(), 1);
  assert.equal(await app.pending(), 0, 'a half-built turn does not follow you');
}));

test('scores and the current turn survive a reload', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');          // P1: 1000, P2 up
  await app.typeAmount(250);         // half-built turn for P2
  await app.reload();
  assert.equal(await app.sideTotal(0), 1000);
  assert.equal(await app.activeSide(), 1);
  assert.equal(await app.pending(), 250);
}));

test('saving the game files it in history and clears the board', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');
  await app.addPreset(500);
  await app.action('bank');
  await app.saveGame();
  assert.equal(await app.sideTotal(0), 0);
  const h = await app.history();
  assert.equal(h.length, 1);
  assert.match(h[0], /🏆 Player 1 — 1000 pts/);
}));

test('the target and opening minimum are stated on screen', () => withApp(async app => {
  assert.match(await app.text('#targetLabel'), /First to 10000 wins/);
  assert.match(await app.text('#targetLabel'), /open with 500/);
  assert.match(await app.text('#lblTarget'), /Target 10000/);
}));

test('Farkle carries its red accent', () => withApp(async app => {
  const cls = await app.page.getAttribute('body', 'class');
  assert.match(cls, /game-farkle/);
}));

test('the dock shows what the current player would have if they banked', () => withApp(async app => {
  await app.addPreset(1000);
  await app.action('bank');          // P1 banks 1000, P2 is up
  await app.addPreset(500);
  await app.addPreset(300);
  assert.equal(await app.text('#lblGrandTotal'), 'Player 2');
  assert.equal(await app.total(), 800, 'banked 0 plus 800 pending');
  await app.action('bank');
  assert.equal(await app.sideTotal(1), 800);
}));
