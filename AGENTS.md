# Agent instructions

These instructions are for coding agents that work in this repository. Read `README.md` for what the app does and how the code is laid out. `PLAN.md` is the full v1 specification, and `REPORT.md` records where the build differs from it and lists known problems.

The app, Brewmancer, is built for its owner first. `docs/owner-profile.md` records who she is and what she asked for. Her stated wants outrank research and guesses about other players. When she asks for something new, add it to that file.

## How agents work here

Agents lead this project. The owner gives direction and feedback; she doesn't approve each step. Take a task all the way through on your own: plan it, build it test first, review it, and ship it.

- **Ship it yourself.** Work on a branch, commit, push, and open a pull request. Merge it yourself once `npm test` and `node scripts/check-ui.mjs` pass. Don't wait for the owner to review it.
- **Decide, don't ask.** When this file or `PLAN.md` doesn't cover a detail, pick the most conservative option that keeps the hard rules below, note the choice in the pull request description, and keep going. If the choice departs from `PLAN.md`, record it in `REPORT.md`.
- **Ask the owner only about:**
  - Taste and feel: what she wants, how the app looks, its tone, and the open questions in `docs/owner-profile.md`.
  - Removing a feature she asked for, or changing one significantly.
  - Any change that could lose or damage saved lists, such as IndexedDB schema or backup format changes.
- **When you're not sure she needs to weigh in**, don't ask her yet. First get a second opinion from an Opus subagent (in Claude Code, the Agent tool with `model: "opus"`). Give it the decision, the options, and this section. Ask the owner only if it says she should decide. Otherwise go ahead and record the choice.
- While you wait for her answer, keep working on anything that doesn't depend on it.

## Commands

- Run the tests: `npm test` (or `node --test`). Node.js 20 or later. There are no packages to install.
- Run the app: `python3 -m http.server 8000`, then open <http://localhost:8000/>. ES modules don't load from `file://`.
- Run the browser tests: `node scripts/check-ui.mjs`. It needs Chrome (set `CHROME_PATH` if it's not in the usual place) and network access, because the app sends real Scryfall requests through its queue. It starts its own static server and a fresh browser profile, so you don't need the `http.server` command above. It runs at 390 px and 1280 px, in light and dark mode, and takes about a minute. To run one width, set `ONLY=390` or `ONLY=1280`, and optionally `SCHEME=dark`.
- Repeat the live API checks: `node scripts/check-api.mjs`.
- Fetch the test fixtures again: `scripts/fetch-fixtures.sh`.
- Redraw the PNG icons after changing the design: `node scripts/make-icons.js`. Keep it in step with `icons/icon.svg`.

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

- Never invent card data, IDs, or API behavior. Test fixtures in `tests/fixtures/` are real API responses. To add one, add it to `scripts/fetch-fixtures.sh`, and fetch it with the headers above and the 500 ms spacing.
- Explore uses only the Scryfall Tagger tags in `VERIFIED_TAGS` in `src/explore.js`. Before you add a tag, check it against the live API. `scripts/check-api.mjs` checks them all again.
- Don't change `APP_ID` in `src/config.js`. Backup files use it.
- To change the IndexedDB schema, raise `DB_VERSION` in `src/config.js` and add a step to `UPGRADES` in `src/storage/indexeddb.js`. Never edit an earlier upgrade step.
- To change the backup format, raise `BACKUP_SCHEMA_VERSION` in `src/config.js`, add it to `READABLE_BACKUP_VERSIONS`, and keep the import checks in `src/export.js` in step with it. Old backups must still import.

## Test-driven development

All work here is test driven.

1. Write the test first and run it to see it fail for the expected reason.
2. Write the smallest code that makes it pass, then refactor with the tests green.
3. For a bug, first write a test that reproduces it.

Where tests go:

- Logic goes in a pure module, with unit tests in `tests/` that use the real fixtures. Run them with `npm test`.
- `tests/helpers.js` has `fixture(name)` (loads `tests/fixtures/<name>.json`), `snap(name, changes)` (a saved-card snapshot from a fixture), and `fakeClock()`. Pass dependencies in rather than mocking globals: functions take a `clock` argument, `createClient()` in `src/scryfall.js` takes `fetchImpl`, and storage tests use `createMemoryBackend()` from `src/storage/memory.js` in place of IndexedDB.
- UI behavior gets a check in `scripts/check-ui.mjs`: the control exists, it does the right thing, focus goes where it should, and nothing scrolls sideways. Add the check before you build the UI.
- When a test is added after the code, break the code on purpose, see the test fail, then restore the code.

## Code conventions

- The modules `query.js`, `cards.js`, `lists.js`, `deck-rules.js`, `export.js`, `draw.js`, `synergy.js`, `explore.js`, `browse.js`, `saved.js`, `stats.js`, `links.js`, and `glossary.js` in `src/` are pure: they don't use the DOM, the network, or storage. Put new logic in a pure module, and test it with `node --test`.
- UI code is in `src/ui/`. Build elements with the `h()` helper in `src/ui/dom.js`. Don't use `innerHTML` with card data or user text.
- Don't use browser dialogs (`alert`, `confirm`, `prompt`). Use `confirmBox()` from `src/ui/dom.js`.
- Keep the app usable by keyboard and screen reader: label every control, and send status messages through `announce()`.
- The app name is `APP_NAME` in `src/config.js`. `README.md` lists the other places where the name appears.
- `.artifacts/` is gitignored. Put plans, screenshots, and review reports there, not in the tracked tree.

## Before you finish

- The tests were written before the code, and they pass.
- If you changed anything in the UI, `node scripts/check-ui.mjs` passes, and its checks cover the change.
- If you changed what the app does, update `README.md`.
- Your pull request is merged. If something blocks the merge, tell the owner what it is.
