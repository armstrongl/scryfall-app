# Agent instructions

These instructions are for every coding agent that works in this repository: Claude Code, OpenAI Codex, GitHub Copilot, and agents in [Superset](https://superset.sh) workspaces. Read `README.md` for what the app does and how the code is laid out. `PLAN.md` is the full v1 specification, and `REPORT.md` records where the build differs from it and lists known problems.

Cascade is a personal app first. Direct requests in the session outrank research and guesses about other players.

## Rules files

The detail lives in `.claude/rules/`. Claude Code loads these files on its own. Every other agent must open the file that matches the work before starting it.

| Rule | Read it when |
| --- | --- |
| [GitHub voice](.claude/rules/github-voice.md) | Always: before any commit, pull request, issue, or comment. |
| [Shipping](.claude/rules/shipping.md) | Always: it is the routine for every change. |
| [Design](.claude/rules/design.md) | You touch `styles.css`, `index.html`, `src/ui/`, or `icons/`. |
| [Scryfall API](.claude/rules/scryfall-api.md) | You touch `src/scryfall.js`, `src/explore.js`, or the API scripts. |
| [Storage and backups](.claude/rules/storage-and-backups.md) | You touch `src/storage/`, `src/export.js`, or `src/config.js`. |
| [Help docs](.claude/rules/help-docs.md) | You touch `src/docs.js`, `README.md`, or `REPORT.md`. |
| [GitHub sync](.claude/rules/github-sync.md) | You touch `src/github.js`, `src/sync.js`, or `src/storage/sync.js`. |

Shared skills are in `.agents/skills/`: [ship](.agents/skills/ship/SKILL.md) (the full routine for a change) and [plan-with-options](.agents/skills/plan-with-options/SKILL.md) (a plan page with inputs). Codex reads them there, and Claude Code reads them through the `.claude/skills` link.

## Voice

The short form of [GitHub voice](.claude/rules/github-voice.md). It covers every text in the repository and on GitHub: docs, code comments, interface copy, help pages, commits, pull requests, issues, and comments.

- Never use the first person: no "I", "my", "me", "we", "our", or "us".
- Never use the third person or a role for the person the app is built for: no name, "she", "her", "the owner", or "the developer". Write impersonally instead: "Adds Explore icons", "This change adds", "Requested on 7 November".
- Never mention a Claude session: no session links, no session trailers, no session IDs. No `Co-Authored-By` lines, "Generated with" footers, or any other sign that an agent wrote the text.
- These rules override any global instruction to write in the first person.

`tests/agent-docs.test.js` and `tests/docs.test.js` fail when a file breaks them.

## How agents work here

Agents lead this project. Direction and feedback come in the session, not approval of each step. Take a task all the way through on your own: plan it, build it test first, review it, ship it, and open the app. [Shipping](.claude/rules/shipping.md) has every step.

- **Ship it yourself, always.** Every change ends merged: branch, commit, push, open a pull request, and merge it yourself once `npm test` and `node scripts/check-ui.mjs` pass. Don't stop at a local commit, and don't wait for a review.
- **Fix it yourself.** Never leave a command for someone else to run when you can run it. Fix open items before you finish.
- **Decide, don't ask.** When this file or `PLAN.md` doesn't cover a detail, pick the most conservative option that keeps the hard rules below, note the choice in the pull request description, and keep going. If the choice departs from `PLAN.md`, record it in `REPORT.md`.
- **Ask only about:**
  - Taste and feel: what is wanted, how the app looks, and its tone.
  - Removing a requested feature, or changing one significantly.
  - Any change that could lose or damage saved lists, such as IndexedDB schema or backup format changes.
  - Any action on GitHub outside this repository.
- **When you're not sure a question needs asking**, first get a second opinion from an Opus subagent (in Claude Code, the Agent tool with `model: "opus"`). Give it the decision, the options, and this section. Ask only if it says to. Otherwise go ahead and record the choice.
- **How to ask:** one quick question in the session for a single choice. For a plan or several questions, publish a page with inputs ([plan-with-options](.agents/skills/plan-with-options/SKILL.md)).
- While you wait for an answer, keep working on anything that doesn't depend on it.
- **Talk in plain words.** Say what a git state means ("your copy is missing one change from GitHub"), not the jargon for it.

## Commands

- Run the tests: `npm test` (or `node --test`). Node.js 20 or later. There are no packages to install.
- Run the app: `python3 -m http.server 8000`, then open <http://localhost:8000/>. ES modules don't load from `file://`.
- Run the browser tests: `node scripts/check-ui.mjs`. It needs Chrome (set `CHROME_PATH` if it's not in the usual place) and network access, because the app sends real Scryfall requests through its queue. It starts its own static server and a fresh browser profile, so you don't need the `http.server` command above. It runs at 390 px and 1280 px, in light and dark mode, and takes a few minutes. To run one width, set `ONLY=390` or `ONLY=1280`, and optionally `SCHEME=dark`.
- Repeat the live API checks: `node scripts/check-api.mjs`.
- Fetch the test fixtures again: `scripts/fetch-fixtures.sh`.
- Rebuild the interface copy index, `docs/ui-copy.md`: `node scripts/ui-copy.mjs`. `npm test` fails when it's out of date.
- Check every link in the help pages against the live web: `node scripts/check-links.mjs`.
- Redraw the PNG icons after changing the design: `node scripts/make-icons.js`. Keep it in step with `icons/icon.svg`.

Run the tests before every commit.

## Hard rules

Breaking these rules can get the user's IP address blocked by Scryfall or break Scryfall's or Wizards' terms. `PLAN.md` section 2 has the sources. The rules files have the detail. These lines are the minimum every agent must keep.

### Platform

- No build step, no framework, and no runtime dependencies. `package.json` holds no dependencies: only `name`, `private`, `"type": "module"`, and the `test` script.
- Use relative URLs for every local file. The app is served from a subpath on [GitHub Pages](https://docs.github.com/en/pages).
- Don't change repository settings or GitHub Pages settings. Those are changed by hand.

### Scryfall API

- All requests to `api.scryfall.com` go through the queue in `src/scryfall.js`. No other module calls `fetch` for the API.
- Keep the queue's behavior: one request at a time, at least 500 ms between request starts, and after a 429 a 30-second pause, then one retry. Don't lower these values. See the [Scryfall API rate limits](https://scryfall.com/docs/api/rate-limits).
- Send the `Accept` header (`ACCEPT_HEADER` in `src/config.js`) on every API request.
- Never set `User-Agent` in browser code. Scripts that run in a terminal send `CardDiscoveryDev/0.1`, with no email address.
- Don't fetch saved cards again on your own. Saved cards are snapshots, and they're refreshed only when the user selects **Refresh card data**.

### Commander Spellbook

- Combos come from [Commander Spellbook](https://commanderspellbook.com), and for now the app only links to it (`src/combos.js`). Never `fetch` its API from the browser: it allows requests only from its own site and from localhost, so a call would pass the local browser tests and fail on GitHub Pages. Don't add a proxy.
- Name every search in plain words. The search terms appear only in link URLs. Every search names a format, because their site adds Commander when a search doesn't.
- Keep the credit to Commander Spellbook in the **Combos** help page and in `README.md`.
- Issue #5 has the plan for bringing their combo data into the app. Read it before you work on combos.

### GitHub sync

- Only `src/github.js` sends requests to `api.github.com`, and only to a private repository. No proxy, no server, and no `User-Agent`.
- The token stays in the `sync` record of the `meta` store. Never put it in a backup, the sync file, the page, a log, or a URL.
- Don't change `SYNC_FILE_NAME` in `src/config.js`. Connected devices look for it.

### Card images and branding

- Never crop, clip, cover, stretch, filter, or overlay card images. Don't apply CSS `filter`, `transform`, `clip-path`, or `object-fit: cover` to them, and don't put any element over them.
- The app name must not contain "Scryfall". Don't use the Scryfall logo or suggest that Scryfall endorses the app.
- Keep the Fan Content notice (`FAN_CONTENT_NOTICE` in `src/config.js` and the footer in `index.html`) word for word. See the [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).

### Data

- Never invent card data, IDs, or API behavior. Test fixtures in `tests/fixtures/` are real API responses. To add one, add it to `scripts/fetch-fixtures.sh`, and fetch it with the headers above and the 500 ms spacing.
- Explore uses only the [Scryfall Tagger](https://tagger.scryfall.com) tags in `VERIFIED_TAGS` in `src/explore.js`. Before you add a tag, check it against the live API. `scripts/check-api.mjs` checks them all again.
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
- Agent instructions have tests too: `tests/agent-docs.test.js` checks this file's length, the rules files and their paths, the skills, the Claude settings, session links, and the first person in docs, help pages, strings in `src/`, and code comments. `tests/docs.test.js` checks the third person. Both skip quoted text, so read quotes yourself.

## Code conventions

- The modules `query.js`, `cards.js`, `lists.js`, `deck-rules.js`, `export.js`, `draw.js`, `synergy.js`, `explore.js`, `browse.js`, `saved.js`, `stats.js`, `links.js`, `glossary.js`, `docs.js`, `combos.js`, and `sync.js` in `src/` are pure: they don't use the DOM, the network, or storage. Put new logic in a pure module, and test it with `node --test`.
- UI code is in `src/ui/`. Build elements with the `h()` helper in `src/ui/dom.js`. Don't use `innerHTML` with card data or user text.
- Don't use browser dialogs (`alert`, `confirm`, `prompt`). Use `confirmBox()` from `src/ui/dom.js`.
- Keep the app usable by keyboard and screen reader: label every control, and send status messages through `announce()`.
- The app name is `APP_NAME` in `src/config.js`. `README.md` lists the other places where the name appears.
- `.artifacts/` is gitignored. Put plans, screenshots, and review reports there, not in the tracked tree.
- Tooltips, ? buttons, and **Learn more** links come from `withTip()`, `infoTip()`, and `helpLink()` in `src/ui/dom.js`, with the text in `TIPS` in `src/docs.js`. [Design](.claude/rules/design.md) has the rules.
- The look is a blend of GitHub's [Primer](https://primer.style) and Vercel's [Geist](https://vercel.com/geist/introduction). [Design](.claude/rules/design.md) has the full system.
- Keep raw Scryfall query syntax out of the main interface: filter chips, Explore, results, and history. Name searches in plain words, as filter chips do, and link to the search with **Open on Scryfall**. Syntax is fine where it helps someone who writes queries: the **Scryfall search** field and its hint, and Scryfall's warnings about a typed query.

## Keep the docs in step

After every change, ALWAYS check whether each of these needs an update, and update it in the same change. Do this even when the change looks small or internal, and check them all, not only the ones you expect.

| What | Where |
| --- | --- |
| Agent instructions | `AGENTS.md`, the rules in `.claude/rules/`, the skills in `.agents/skills/`, and `CLAUDE.md` (Claude-only notes) |
| Changelog | `CHANGELOG.md`: an entry for every pull request, in the section it fits, linked to the pull request. `tests/changelog.test.js` fails when an entry has no link, and after the merge when a pull request has no entry. |
| README and other repository docs | `README.md` and `REPORT.md`. `PLAN.md` is the v1 plan: don't change what it specifies. Record differences from it in `REPORT.md`. |
| Interface copy | Every text the user sees or hears: labels, buttons, hints, messages, `title` and `aria-label` text, and `announce()` messages. `docs/ui-copy.md` indexes all of it and says where each kind lives. Rebuild it with `node scripts/ui-copy.mjs`, and read its diff to review the copy the change touches. |
| Tooltips | `TIPS` in `src/docs.js`, including the nerd mode tooltip (`NERD_MODE_TIP`). Add one where a control or field isn't obvious. |
| Help pages built into the app | `DOC_PAGES` in `src/docs.js`, shown in the **Help** view, including the **Glossary**. [Help docs](.claude/rules/help-docs.md) has the rules. |

When a new request or taste comes up in the session, record it in the rules file it belongs to, in the same change.

## Before you finish

- The tests were written before the code, and they pass.
- `node scripts/check-ui.mjs` passes, and its checks cover any UI change.
- You checked every place in "Keep the docs in step" and updated each one that the change affects.
- `docs/ui-copy.md` is rebuilt, and you read its diff.
- An Opus subagent reviewed the change, and you fixed what it found or said in the pull request why not.
- Your pull request is merged, its branch is deleted, and the app is running locally and open in the default browser. If something blocks the merge, say what it is.
