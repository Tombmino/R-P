# Ronda y Punto (R&P)

Digital score sheets for dice and card games played in person. No dice simulation, no card simulation, no accounts.

- `app/` – the website itself (what Netlify publishes)
  - `index.html` + `styles.css` – shell
  - `main.js` – service worker, install prompt, router
  - `home.js` – home screen with game cards
  - `core/` – reusable modules shared by every game (config, storage, UI)
  - `games/` – one file per game. Each exports a `render<GameName>(container)`
  - `manifest.json`, `sw.js`, `icon.svg` – PWA assets
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
