# Scorekeeper (working name: DiceScore)

Digital score sheets for dice games played in person. No dice simulation, no accounts.

- `app/` – the website itself (what Netlify publishes)
- `tests/` – automated checks that tap through the app in a headless browser

## Running the tests

One-time setup (needs Node.js):

```
npm install
npx playwright install chromium
```

Then:

```
npm test
```

Tests marked `# TODO KNOWN BUG …` describe the correct behaviour for a bug that
hasn't been fixed yet. They're expected to fail and don't count as failures;
each one should turn green when its bug is fixed.
