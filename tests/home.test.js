// The game chooser: every game reachable, nothing left as a placeholder.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');

before(setup);
after(teardown);

const GAMES = ['yahtzee', 'generala', 'farkle', 'truco'];

test('all four games are on the home screen and none is coming-soon', async () => {
  const app = await freshApp({ game: '' });
  try {
    const cards = await app.page.$$eval('.game-card',
      els => els.map(e => ({
        cls: e.className,
        href: e.getAttribute('href'),
        title: e.querySelector('h2').textContent.trim()
      })));
    assert.equal(cards.length, 4);
    assert.deepEqual(cards.map(c => c.title), ['Yahtzee', 'Generala', 'Farkle', 'Truco']);
    for (const c of cards) {
      assert.ok(!c.cls.includes('coming-soon'), `${c.title} is playable`);
      assert.match(c.href, /^#\//, `${c.title} has a route`);
    }
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

for (const game of GAMES) {
  test(`${game} loads from the home screen and can get back to it`, async () => {
    const app = await freshApp({ game: '' });
    try {
      await app.page.click(`.game-card-${game}`);
      await app.page.waitForSelector('#btnLang');
      assert.match(await app.page.getAttribute('body', 'class'), new RegExp(`game-${game}`));
      await app.page.click('#btnHome');
      await app.page.waitForSelector('.game-card');
      assert.doesNotMatch(await app.page.getAttribute('body', 'class') || '', /game-/);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

test('an unknown route falls back to the home screen', async () => {
  const app = await freshApp({ game: 'nonsense' });
  try {
    await app.page.waitForSelector('.game-card');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('every screen shows the same app version, from one source', async () => {
  const { APP_VERSION } = await import('../app/core/config.js');
  for (const game of GAMES) {
    const app = await freshApp({ game });
    try {
      assert.equal(await app.text('#appVersion'), `v${APP_VERSION}`,
        `${game} reports the app version`);
    } finally { await app.close(); }
  }
});
