# Agent instructions

These instructions are for coding agents that work in this repository. Read `README.md` for what the app does and how the code is laid out. `PLAN.md` is the full v1 specification, and `REPORT.md` records where the build differs from it and lists known problems.

Cascade is built for one player first. A stated request outranks research and guesses about other players.

How to write for this project:

- Docs, help pages, tooltips, interface copy, and code comments never use the first person singular. Write them the way good technical writing and interface copy do: speak to the reader as "you", use the imperative for steps, and call the app "the app" or by its name.
- Never refer to a person in the third person or by a role. "The user" means anyone who uses the app.
- Commit messages, pull requests, and comments on GitHub are in the first person, as the account that posts them.

`tests/docs.test.js` fails if a doc or the app's text breaks these rules.

## How agents work here

Agents lead this project. Direction and feedback come with each task, and no one approves each step. Take a task all the way through on your own: plan it, build it test first, review it, and ship it.

- **Ship it yourself, always.** Every change ends merged: work on a branch, commit, push, open a pull request, and merge it yourself once `npm test` and `node scripts/check-ui.mjs` pass. Don't stop at a local commit, and don't wait for a review.
- **Decide, don't ask.** When this file or `PLAN.md` doesn't cover a detail, pick the most conservative option that keeps the hard rules below, note the choice in the pull request description, and keep going. If the choice departs from `PLAN.md`, record it in `REPORT.md`.
- **Ask first only about:**
  - Taste and feel: what the app should do, how it looks, and its tone.
  - Removing a requested feature, or changing one significantly.
  - Any change that could lose or damage saved lists, such as IndexedDB schema or backup format changes.
- **When you're not sure a decision needs asking**, don't ask yet. First get a second opinion from an Opus subagent (in Claude Code, the Agent tool with `model: "opus"`). Give it the decision, the options, and this section. Ask only if it says the decision needs asking. Otherwise go ahead and record the choice.
- While you wait for an answer, keep working on anything that doesn't depend on it.

## Commands

- Run the tests: `npm test` (or `node --test`). Node.js 20 or later. There are no packages to install.
- Run the app: `python3 -m http.server 8000`, then open <http://localhost:8000/>. ES modules don't load from `file://`.
- Run the browser tests: `node scripts/check-ui.mjs`. It needs Chrome (set `CHROME_PATH` if it's not in the usual place) and network access, because the app sends real Scryfall requests through its queue. It starts its own static server and a fresh browser profile, so you don't need the `http.server` command above. It runs at 390 px and 1280 px, in light and dark mode, and takes a few minutes. To run one width, set `ONLY=390` or `ONLY=1280`, and optionally `SCHEME=dark`.
- Repeat the live API checks: `node scripts/check-api.mjs`.
- Rebuild the interface copy index, `docs/ui-copy.md`: `node scripts/ui-copy.mjs`. `npm test` fails when it's out of date.
- Check every link in the help pages against the live web: `node scripts/check-links.mjs`.
- Fetch the test fixtures again: `scripts/fetch-fixtures.sh`.
- Redraw the PNG icons after changing the design: `node scripts/make-icons.js`. Keep it in step with `icons/icon.svg`.

Run the tests before every commit.

## Hard rules

Breaking these rules can get the user's IP address blocked by Scryfall or break Scryfall's or Wizards' terms. `PLAN.md` section 2 has the sources.

### Platform

- No build step, no framework, and no runtime dependencies. `package.json` holds no dependencies: only `name`, `private`, `"type": "module"`, and the `test` script.
- Use relative URLs for every local file. The app is served from a subpath on GitHub Pages.
- Don't change repository settings or GitHub Pages settings. Those are changed by hand.

### Scryfall API

- All requests to `api.scryfall.com` go through the queue in `src/scryfall.js`. No other module calls `fetch` for the API.
- Keep the queue's behavior: one request at a time, at least 500 ms between request starts, and after a 429 a 30-second pause, then one retry. Don't lower these values.
- Send the `Accept` header (`ACCEPT_HEADER` in `src/config.js`) on every API request.
- Never set `User-Agent` in browser code. Scripts that run in a terminal send `CardDiscoveryDev/0.1`, with no email address.
- Don't fetch saved cards again on your own. Saved cards are snapshots, and they're refreshed only when the user selects **Refresh card data**.

### Commander Spellbook

- Combos come from [Commander Spellbook](https://commanderspellbook.com), and for now the app only links to it (`src/combos.js`). Never `fetch` its API from the browser: it allows requests only from its own site and from localhost, so a call would pass the local browser tests and fail on GitHub Pages. Don't add a proxy.
- Name every search in plain words. The search terms appear only in link URLs. Every search names a format, because their site adds Commander when a search doesn't.
- Keep the credit to Commander Spellbook in the **Combos** help page and in `README.md`.
- Issue #5 has the plan for bringing their combo data into the app. Read it before you work on combos.

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

- The modules `query.js`, `cards.js`, `lists.js`, `deck-rules.js`, `export.js`, `draw.js`, `synergy.js`, `explore.js`, `browse.js`, `saved.js`, `stats.js`, `links.js`, `glossary.js`, `docs.js`, and `combos.js` in `src/` are pure: they don't use the DOM, the network, or storage. Put new logic in a pure module, and test it with `node --test`.
- UI code is in `src/ui/`. Build elements with the `h()` helper in `src/ui/dom.js`. Don't use `innerHTML` with card data or user text.
- Don't use browser dialogs (`alert`, `confirm`, `prompt`). Use `confirmBox()` from `src/ui/dom.js`.
- Keep the app usable by keyboard and screen reader: label every control, and send status messages through `announce()`.
- The app name is `APP_NAME` in `src/config.js`. `README.md` lists the other places where the name appears.
- `.artifacts/` is gitignored. Put plans, screenshots, and review reports there, not in the tracked tree.
- The look follows GitHub's Primer and Vercel's Geist design systems: neutral grays, the system font, 6px corners, 1px borders, a blue accent for links and focus, and black (light mode) or white (dark mode) primary buttons. Use the color tokens at the top of `styles.css`. Don't add gradients, glows, or decorative color. Color comes from the cards.
- Give a button or link a tooltip with `withTip()`, and explain a field or setting with a ? button from `infoTip()`, both in `src/ui/dom.js`. Put the text in `TIPS` in `src/docs.js`: one or two short sentences that say what the control does or what the field means. A tooltip never holds the only copy of something: the help pages say it too. Don't put a tooltip on a card tile, where it would cover a card image.
- Link from the app to a help page with `helpLink()` in `src/ui/dom.js`, with text that starts with "Learn more about". In a dialog, call `closeOnHelpLink()` so the dialog closes and the page shows.
- In the help pages, link the sites, apps, formats, mechanics, and cards a page mentions, with `[label](url)` markup. Use the helpers at the top of `src/docs.js`: `link()`, `format()` for a format page on the Wizards of the Coast site, `wiki()` for the MTG Wiki, `card()` for a card on Scryfall, and `help()` for another help page. Prefer official sources first: Wizards of the Coast, Scryfall, and Commander Spellbook. When in doubt, add the link. After you add or change one, run `node scripts/check-links.mjs`.
- Keep raw Scryfall query syntax out of the main interface: filter chips, Explore, results, and history. Name searches in plain words, as filter chips do, and link to the search with **Open on Scryfall**. Syntax is fine where it helps someone who writes queries: the **Scryfall search** field and its hint, and Scryfall's warnings about a typed query.

## Keep the docs in step

After every change, ALWAYS check whether each of these needs an update, and update it in the same change. Do this even when the change looks small or internal, and check them all, not only the ones you expect.

| What | Where |
| --- | --- |
| Agent instructions | `AGENTS.md` (`CLAUDE.md` only points here) |
| README and other repository docs | `README.md` and `REPORT.md`. `PLAN.md` is the v1 plan: don't change what it specifies. Record differences from it in `REPORT.md`. |
| Interface copy | Every text the user sees or hears: labels, buttons, hints, messages, `title` and `aria-label` text, and `announce()` messages. `docs/ui-copy.md` indexes all of it, with a table of where each kind of copy lives. Rebuild it with `node scripts/ui-copy.mjs`, and read its diff to review every text the change adds or changes. |
| Tooltips | `TIPS` in `src/docs.js`, including the nerd mode tooltip (`NERD_MODE_TIP`). Add a tooltip where a control or field isn't obvious. |
| Help pages built into the app | `DOC_PAGES` in `src/docs.js`, shown in the **Help** view, including the **Glossary**. Link what each page mentions, and add new Magic terms to the Glossary. Run `node scripts/check-links.mjs` after a link changes. |

`tests/docs.test.js` checks the help pages against the app's real limits, checks their links and tooltips, and catches some removed features, old names, and first-person text. `tests/ui-copy.test.js` fails when `docs/ui-copy.md` is out of date. When you remove or rename something in the app, add the old wording to its list of words that must not appear. The tests can't catch everything, so read the pages too.

## Before you finish

- The tests were written before the code, and they pass.
- If you changed anything in the UI, `node scripts/check-ui.mjs` passes, and its checks cover the change.
- You checked every place in "Keep the docs in step" and updated each one that the change affects: `AGENTS.md`, `README.md`, `REPORT.md`, the interface copy and tooltips, and the help pages in `src/docs.js`.
- `docs/ui-copy.md` is rebuilt, and you read its diff.
- Your pull request is merged. If something blocks the merge, say what it is.
