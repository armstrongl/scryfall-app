# Agent instructions

These instructions are for coding agents that work in this repository. Read `README.md` for what the app does and how the code is laid out. `PLAN.md` is the full v1 specification, and `REPORT.md` records where the build differs from it and lists known problems.

## Commands

- Run the tests: `npm test` (or `node --test`). Node.js 20 or later. There are no packages to install.
- Run the app: `python3 -m http.server 8000`, then open <http://localhost:8000/>. ES modules don't load from `file://`.
- Repeat the live API checks: `node scripts/check-api.mjs`.
- Fetch the test fixtures again: `scripts/fetch-fixtures.sh`.

Run the tests before every commit.

## Hard rules

Breaking these rules can get the user's IP address blocked by Scryfall or break Scryfall's or Wizards' terms. `PLAN.md` section 2 has the sources.

### Platform

- No build step, no framework, and no runtime dependencies. `package.json` holds only the `test` script and `"type": "module"`.
- Use relative URLs for every local file. The app is served from a subpath on GitHub Pages.
- Don't change repository settings or GitHub Pages settings. The owner does that.

### Scryfall API

- All requests to `api.scryfall.com` go through the queue in `src/scryfall.js`. No other module calls `fetch` for the API.
- Keep the queue's behavior: one request at a time, at least 500 ms between request starts, and after a 429 a 30-second pause, then one retry. Don't lower these values.
- Send the `Accept` header (`ACCEPT_HEADER` in `src/config.js`) on every API request.
- Never set `User-Agent` in browser code. Scripts that run in a terminal send `CardDiscoveryDev/0.1`, with no email address.
- Don't fetch saved cards again on your own. Saved cards are snapshots, and they're refreshed only when the user selects **Refresh card data**.

### Card images and branding

- Never crop, clip, cover, stretch, filter, or overlay card images. Don't apply CSS `filter`, `transform`, `clip-path`, or `object-fit: cover` to them, and don't put any element over them.
- The app name must not contain "Scryfall". Don't use the Scryfall logo or suggest that Scryfall endorses the app.
- Keep the Fan Content notice (`FAN_CONTENT_NOTICE` in `src/config.js` and the footer in `index.html`) word for word.

### Data

- Never invent card data, IDs, or API behavior. Test fixtures in `tests/fixtures/` are real API responses. To add one, fetch it with the headers above and the 500 ms spacing.
- Don't change `APP_ID` in `src/config.js`. Backup files use it.
- To change the IndexedDB schema, raise `DB_VERSION` and add an upgrade step in `src/storage/indexeddb.js`. Never edit an earlier upgrade step.
- To change the backup format, raise `BACKUP_SCHEMA_VERSION` and keep the import checks in `src/export.js` in step with it.

## Code conventions

- The modules `query.js`, `cards.js`, `lists.js`, `deck-rules.js`, `export.js`, `draw.js`, and `synergy.js` in `src/` are pure: they don't use the DOM, the network, or storage. Put new logic in a pure module, and test it with `node --test`.
- UI code is in `src/ui/`. Build elements with the `h()` helper in `src/ui/dom.js`. Don't use `innerHTML` with card data or user text.
- Don't use browser dialogs (`alert`, `confirm`, `prompt`). Use `confirmBox()` from `src/ui/dom.js`.
- Keep the app usable by keyboard and screen reader: label every control, and send status messages through `announce()`.
- The app name is `APP_NAME` in `src/config.js`. `README.md` lists the other places where the name appears.

## Before you finish

- The tests pass.
- If you changed anything in the UI, load the app in a browser and check the change at phone width (390 px) and desktop width.
- If you changed what the app does, update `README.md`.
