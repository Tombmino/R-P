// Per-player colours: the screen takes the colour of the player on
// screen, so you know whose turn it is without reading anything.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

async function withApp(game, fn, opts = {}) {
  const app = await freshApp({ game, ...opts });
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

const SCORECARD = ['yahtzee', 'generala'];

for (const game of SCORECARD) {
  test(`${game}: players start on different colours and the screen matches the card shown`, () =>
    withApp(game, async app => {
      assert.equal(await app.playerDot(0), 'blue');
      assert.equal(await app.playerDot(1), 'red');
      assert.equal(await app.screenColor(), 'blue', 'player 1 is on screen');
      await app.selectPlayer(1);
      assert.equal(await app.screenColor(), 'red', 'the screen follows the card');
    }));

  test(`${game}: a player can change colour, and it sticks`, () =>
    withApp(game, async app => {
      await app.setColor('violet');
      assert.equal(await app.playerDot(0), 'violet');
      assert.equal(await app.screenColor(), 'violet');
      await app.reload();
      assert.equal(await app.playerDot(0), 'violet', 'survives a reload');
      assert.equal(await app.screenColor(), 'violet');
    }));

  test(`${game}: name and colour are set together in one sheet`, () =>
    withApp(game, async app => {
      await app.page.click('#btnRenamePlayer');
      await app.page.waitForSelector('#playerModal.open');
      await app.page.fill('#playerNameInput', 'Ana');
      await app.page.click('#colorRow .swatch[data-color="teal"]');
      await app.page.click('#btnSavePlayer');
      assert.equal(await app.activePlayer(), 'Ana');
      assert.equal(await app.playerDot(0), 'teal');
      assert.equal(await app.page.isVisible('#playerModal.open'), false, 'sheet closes');
    }));

  test(`${game}: six players get six different colours`, () =>
    withApp(game, async app => {
      for (let i = 0; i < 4; i++) await app.addPlayer();
      assert.equal(await app.playerCount(), 6);
      const dots = [];
      for (let i = 0; i < 6; i++) dots.push(await app.playerDot(i));
      assert.equal(new Set(dots).size, 6, `all distinct: ${JSON.stringify(dots)}`);
    }));

  test(`${game}: colours already in use are marked, but still choosable`, () =>
    withApp(game, async app => {
      await app.page.click('#btnRenamePlayer');
      await app.page.waitForSelector('#playerModal.open');
      // Player 2 is red, so red is marked taken on player 1's sheet.
      const redTaken = await app.page.getAttribute('#colorRow .swatch[data-color="red"]', 'class');
      assert.match(redTaken, /taken/);
      const blueTaken = await app.page.getAttribute('#colorRow .swatch[data-color="blue"]', 'class');
      assert.doesNotMatch(blueTaken, /taken/, 'your own colour is not "taken"');
      // Choosing it anyway is allowed — some tables want two blues.
      await app.page.click('#colorRow .swatch[data-color="red"]');
      await app.page.click('#btnSavePlayer');
      assert.equal(await app.playerDot(0), 'red');
    }));

  test(`${game}: changing colour can be undone`, () =>
    withApp(game, async app => {
      await app.setColor('pink');
      assert.equal(await app.playerDot(0), 'pink');
      await app.undo();
      assert.equal(await app.playerDot(0), 'blue');
    }));
}

test('farkle: the active side colours the screen and each side keeps a dot', () =>
  withApp('farkle', async app => {
    assert.equal(await app.sideDot(0), 'blue');
    assert.equal(await app.sideDot(1), 'red');
    assert.equal(await app.screenColor(), 'blue');
    await app.addPreset(1000);
    await app.action('bank');          // the dice pass to player 2
    assert.equal(await app.screenColor(), 'red', 'the screen changes with the turn');
  }));

test('farkle: colour can be changed from the same sheet as the name', () =>
  withApp('farkle', async app => {
    await app.setColor('amber');
    assert.equal(await app.sideDot(0), 'amber');
    assert.equal(await app.screenColor(), 'amber');
  }));

test('truco keeps its own accent — two fixed teams, no colour picker', () =>
  withApp('truco', async app => {
    assert.equal(await app.screenColor(), null, 'no player colour is applied');
    assert.match(await app.page.getAttribute('body', 'class'), /game-truco/);
    await app.page.click('#btnRenamePlayer');
    await app.page.waitForSelector('#playerModal.open');
    assert.equal(await app.page.isVisible('#colorRow'), false, 'no swatches');
    assert.equal(await app.text('#lblPlayerModalTitle'), 'Edit team');
  }));

test('leaving a game clears the player colour from the screen', () =>
  withApp('yahtzee', async app => {
    assert.equal(await app.screenColor(), 'blue');
    await app.page.click('#btnHome');
    await app.page.waitForSelector('.game-card');
    assert.equal(await app.screenColor(), null);
  }));

test('a game saved before colours existed still opens, with colours assigned', () =>
  withApp('yahtzee', async app => {
    // Write a pre-colour save: players with no colour field at all.
    await app.page.evaluate(() => {
      localStorage.setItem('sk.yahtzee.state', JSON.stringify({
        lang: 'en', dark: false, autoAdvance: false, activeIndex: 0,
        players: [
          { id: 'p_old1', name: 'Vieja', scores: { yahtzee: 50 }, extraYahtzees: 0 },
          { id: 'p_old2', name: 'Vieja 2', scores: {}, extraYahtzees: 0 }
        ]
      }));
    });
    await app.reload();
    assert.equal(await app.activePlayer(), 'Vieja');
    assert.equal(await app.cell('Yahtzee'), '50', 'the old score survived');
    assert.equal(await app.playerDot(0), 'blue');
    assert.equal(await app.playerDot(1), 'red');
  }));
