// The rules sheet. Read-only: it explains the game and states which
// house rules the app is applying, but nothing in it is tappable.
//
// The point of most of these tests is that the sheet is DERIVED from
// the same data the app scores with, so it cannot drift. If someone
// changes a value in a game definition and forgets the rules, these
// fail.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, freshApp } = require('./helpers');
const { yahtzeeDef } = require('../app/games/yahtzee.js');

before(setup);
after(teardown);

async function withApp(game, fn, opts = {}) {
  const app = await freshApp({ game, ...opts });
  try { await fn(app); assert.deepEqual(app.errors, [], 'no JavaScript errors'); }
  finally { await app.close(); }
}

const GAMES = ['yahtzee', 'generala', 'farkle', 'truco'];

// ---------- Present everywhere ----------

for (const game of GAMES) {
  test(`${game}: the 📖 button opens a sheet with all three parts`, () =>
    withApp(game, async app => {
      assert.equal(await app.page.isVisible('#rulesModal.open'), false, 'shut to begin with');
      await app.openRules();
      const text = await app.rulesText();
      assert.ok(text.length > 150, 'there is an explanation, not a stub');
      assert.ok((await app.rulesRows()).length >= 6, 'a scoring table');
      assert.ok((await app.rulesHouseLines()).length >= 3, 'the house rules being applied');
      await app.closeRules();
      assert.equal(await app.page.isVisible('#rulesModal.open'), false);
    }));

  test(`${game}: nothing in the sheet is tappable (read-only for now)`, () =>
    withApp(game, async app => {
      await app.openRules();
      const buttons = await app.page.$$('#rulesBody button, #rulesBody a, #rulesBody input');
      assert.equal(buttons.length, 0, 'no controls inside the sheet body');
    }));

  test(`${game}: the sheet follows the language`, () =>
    withApp(game, async app => {
      await app.openRules();
      const en = await app.rulesText();
      await app.closeRules();
      await app.page.click('#btnLang');          // to Spanish
      await app.openRules();
      const es = await app.rulesText();
      assert.notEqual(en, es, 'the text actually changed');
      assert.match(es, /\b(los|las|el|que|se)\b/, 'reads as Spanish');
    }));
}

// ---------- Derived, so it cannot drift ----------

test('yahtzee: the scoring table is built from the real category values', () =>
  withApp('yahtzee', async app => {
    await app.openRules();
    const rows = Object.fromEntries(await app.rulesRows());

    // Collapsed: six number boxes become one line.
    assert.equal(rows['Ones (Aces) – Sixes'], 'Add up only the dice showing that number');
    assert.equal(rows['Full House'], '25 pts');
    assert.equal(rows['Small Straight'], '30 pts');
    assert.equal(rows['Large Straight'], '40 pts');
    assert.equal(rows['Yahtzee'], '50 pts');
    assert.equal(rows['Chance'], 'All five dice added up');
    assert.equal(rows['Upper Bonus (≥ 63 pts)'], '+35');
    assert.equal(rows['Extra Yahtzee Bonus (+100 ea)'], '+100');
  }));

test('yahtzee: every box on the sheet appears in the rules table', () =>
  withApp('yahtzee', async app => {
    await app.openRules();
    const names = (await app.rulesRows()).map(([n]) => n).join(' | ');
    const lower = yahtzeeDef.sections.find(s => s.id === 'lower');
    for (const cat of lower.categories) {
      const label = yahtzeeDef.strings.en.categories[cat.id].name;
      assert.ok(names.includes(label), `${label} is documented`);
    }
  }));

test('generala: servida values come straight from the scoring data', () =>
  withApp('generala', async app => {
    await app.openRules();
    const rows = Object.fromEntries(await app.rulesRows());
    assert.equal(rows['Escalera (straight)'], 'Built up 20 · Servida (first roll) 40');
    assert.equal(rows['Full'], 'Built up 30 · Servida (first roll) 60');
    assert.equal(rows['Póker'], 'Built up 40 · Servida (first roll) 80');
    assert.equal(rows['Generala'], 'Built up 50 · Servida (first roll) 100');
    assert.equal(rows['Doble Generala'], '100 pts');
  }));

test('generala: the sheet says there is no numbers bonus, because there is none', () =>
  withApp('generala', async app => {
    await app.openRules();
    const names = (await app.rulesRows()).map(([n]) => n).join(' | ');
    assert.doesNotMatch(names, /Bonus/i, 'no bonus row in the table');
    assert.match((await app.rulesHouseLines()).join(' '), /no bonus for the numbers section/i);
  }));

// ---------- Declared tables for the running-total games ----------

test('farkle: the combinations are listed, with the house rules in force', () =>
  withApp('farkle', async app => {
    await app.openRules();
    const rows = Object.fromEntries(await app.rulesRows());
    assert.equal(rows['A single 1'], '100');
    assert.equal(rows['A single 5'], '50');
    assert.equal(rows['Three ones'], '1,000');
    assert.equal(rows['A run of 1 to 6'], '1,500');
    const house = (await app.rulesHouseLines()).join(' ');
    assert.match(house, /10,000/);
    assert.match(house, /500 or more in a single turn/);
    assert.match(house, /Three farkles in a row costs 1,000/);
    assert.match(house, /one more turn to overtake/);
  }));

test('truco: the calls are listed and the malas/buenas split is explained', () =>
  withApp('truco', async app => {
    await app.openRules();
    const rows = Object.fromEntries(await app.rulesRows());
    assert.equal(rows['Truco'], '2');
    assert.equal(rows['Retruco'], '3');
    assert.equal(rows['Vale cuatro'], '4');
    assert.equal(rows['Contraflor'], '6');
    assert.match(rows['Falta envido'], /whatever is left/);
    assert.match(await app.rulesText(), /15 are the malas/);
    assert.match((await app.rulesHouseLines()).join(' '), /no final round/i);
  }));

// ---------- Read aloud ----------

test('the read-aloud button is hidden when the device has no voice', () =>
  withApp('yahtzee', async app => {
    // Headless Chrome ships no speech voices, which is exactly the
    // case the button is supposed to hide itself for.
    await app.openRules();
    const visible = await app.page.isVisible('#btnReadAloud');
    const hasVoices = await app.page.evaluate(
      () => 'speechSynthesis' in window && speechSynthesis.getVoices().length > 0);
    assert.equal(visible, hasVoices,
      'shown only when there is a voice to read with');
  }));

test('read-aloud speaks the rules when a voice is available', () =>
  withApp('yahtzee', async app => {
    // Stand in a fake voice and recorder for the platform speech API,
    // so the wiring is tested without depending on system voices.
    await app.page.evaluate(() => {
      window.__spoken = [];
      window.speechSynthesis.getVoices = () => [{ lang: 'en-GB', name: 'Test', default: true }];
      window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
      window.speechSynthesis.cancel = () => {};
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    });
    await app.openRules();
    await app.page.click('#btnReadAloud');
    const spoken = await app.page.evaluate(() => window.__spoken);
    assert.ok(spoken.length > 5, `several lines were read: ${spoken.length}`);
    assert.match(spoken[0], /roll the five dice/i, 'starts with how it works');
    assert.ok(spoken.some(l => /Full House: 25/.test(l)), 'reads the scoring table');
    assert.ok(spoken.some(l => /63 or more/.test(l)), 'reads the house rules');
  }));

// ---------- Doesn't disturb the game ----------

test('opening the rules mid-game changes nothing', () =>
  withApp('yahtzee', async app => {
    await app.fixed('Yahtzee');
    const before = await app.total();
    await app.openRules();
    await app.closeRules();
    assert.equal(await app.total(), before);
    assert.equal(await app.cell('Yahtzee'), '50');
  }));
