# Final report: Card discovery v1

This report covers the v1 build described in `PLAN.md`. The work was built on the `v1-build` branch and merged to `main` with a fast-forward. No pull request was opened, so the report is in this file.

## What was built

| Milestone | Result |
| --- | --- |
| 1. Project skeleton | `index.html`, `styles.css`, `manifest.webmanifest`, original icons (SVG and PNG, drawn by `scripts/make-icons.js`), `src/config.js` with the app name in one constant, three views with hash navigation, the footer with the Scryfall credit and Fan Content notice, and `node --test`. The page loads at `/` and at a subpath (tested at `http://127.0.0.1:8765/sub/`). |
| 2. Scryfall client | `src/scryfall.js`: one queue for all API calls, one request at a time, at least 500 ms between starts, a 30-second pause and one retry after a 429, cancel through `AbortSignal`, and the error mapping from section 3.4. The interface shows a countdown during a pause. |
| 3. Storage | `src/storage/index.js` implements the section 6 interface on top of a backend. `src/storage/indexeddb.js` uses versioned upgrades in `onupgradeneeded`. If IndexedDB fails, `src/storage/memory.js` takes over: discovery still works, and the app says that lists can't be saved. |
| 4. Criteria and presets | `src/query.js` builds the query in the table order, with the parentheses, quote, and length rules. The form is in `src/ui/criteria-form.js`. Presets: the built-in "Arena Standard", plus save, apply, rename, and delete with a confirmation inside the page. The last criteria come back after a reload. |
| 5. Pool size, draw, display, history | Pool size after 800 ms without changes, cached by query, never shown for an old query. Draws of 1 to 10 cards with duplicate removal by card key, at most 3 × count attempts, progress, and cancel. Card display follows the image rules, with "Show other face" for two-face cards and a text version when the image is missing or fails. History keeps 100 items. |
| 6. Lists | `src/lists.js` (pure) and the Lists view: create, rename, delete, change kind, change quantity, section, and note, remove, sort, group by section with totals. The Add to list panel adds one card to several lists and can make a new list, without leaving Discover. |
| 7. Deck checks | `src/deck-rules.js` (pure): main size, sideboard size, copies across main and sideboard by card key, basic lands with no limit, and legality from the snapshot with "Legality as of" and a refresh link. |
| 8. Export, backup, refresh | Arena text export with a Copy button and a select-all fallback. JSON backup export and import with Merge and Replace, checks before any change, and the 14-day reminder. Refresh through `POST /cards/collection`, 75 IDs per request. The Data view shows the storage persistence status and the iPhone Home Screen advice. |
| 9. Checks and report | Section 9 checks (below), browser tests (below), the README, and this report. |

The work was written in one pass and then committed in eight milestone commits by file group. Some early commits import modules that arrive in later commits, so only the last commit is guaranteed to run.

## Test results

Unit tests: `node --test` runs 73 tests in 8 files. All pass.

| File | Covers |
| --- | --- |
| `tests/query.test.js` | Every row of the criteria table, the empty form, the default criteria, order, parentheses, quotes, the length limit (counted in Unicode characters), and the format keys against a real Card object. |
| `tests/cards.test.js` | Image selection and snapshots for a normal card, a transform card, a modal double-faced card, a split card, and an adventure card. Basic land detection (including a snow basic), the card key, and the text-version rule. |
| `tests/lists.test.js` | Add, merge, change, remove, kind changes, sort, group, and refresh. |
| `tests/deck-rules.test.js` | Each row of the deck table, the maybe section, a basic land with more than 4 copies, and the "Legality as of" date. |
| `tests/export.test.js` | Exact Arena text, export then import with Replace gives the same data, Merge follows the `updatedAt` rule, and a wrong `schemaVersion` is rejected. |
| `tests/scryfall.test.js` | With a fake clock and a fake `fetch`: 500 ms spacing, one request at a time, the 30-second pause, the single retry, rejection after a second 429, cancel, error mapping from real responses, and 100 IDs sent as 2 collection requests. |
| `tests/draw.test.js` | Count limits, duplicate removal, the 3 × count limit, and cancel. |
| `tests/storage.test.js` | History limit (item 101 removes the oldest), `updatedAt` and `lastChangeAt`, and default settings. |

Browser tests: the Chrome extension was not connected, so the agent drove headless Chrome through the DevTools protocol with scripts. They used the real Scryfall API from `http://127.0.0.1:8765/sub/`. Results for the section 8 manual tests:

| Test | Result |
| --- | --- |
| 1. Draw 1 and 10 cards with the default preset | Pass. 10 unique cards. By the browser's own request timestamps, the gaps were 501 to 2038 ms, never under 500. |
| 2. No-match and invalid queries | Pass. `name:zzzzqqqxx` shows "0 cards match" and the draw shows the no-match message. A partly invalid query shows Scryfall's warning near the preview. |
| 3. Both faces of a double-faced card | Pass. "Show other face" switches to the back face image. Computed styles on the image: no filter, no transform, no clip. |
| 4. Add one card to two lists and make a third | Pass, without leaving Discover. |
| 5. Deck with too many copies, sideboard over 15, main under 60 | Pass. All four results show (including a legality error), and a basic land over 4 copies has no result. |
| 6. Arena export and copy | Pass for the text. The copy itself was not checked, because headless Chrome blocks clipboard access. |
| 7. Backup, clear site data, Replace import | Pass. After `Storage.clearDataForOrigin` and a Replace import, the exported data was identical to the original. A file with `schemaVersion: 2` is rejected and no data changes. |
| 8. Refresh a list | Pass. |
| 9. Keyboard only | Partly checked. Tab reaches every control from the skip link to Draw, in order, each with a visible focus outline, and Enter on Draw draws a card. The full app was not checked by keyboard. |

Also checked: no sideways scroll at 390 px and 1280 px in light and dark themes, data stays after a reload, and the app keeps working when IndexedDB throws an error.

Not checked: a real phone, Safari, a screen reader, and the reduced-motion setting.

## Section 9 checks

`scripts/check-api.mjs` repeats these checks.

| Item | Result | Decision |
| --- | --- | --- |
| CORS for browser calls | `curl` returned `access-control-allow-origin: *`. Real browser calls from `127.0.0.1` work for search, random, and collection (`POST` with `Content-Type: application/json` passes the preflight). | No change. |
| Random weighting | Query `game:arena (!"Shock" or !"Shatterskull Smashing")`: Shock has 12 Arena printings, Shatterskull Smashing has 1. In 40 draws, Shock came up 17 times and Shatterskull Smashing 23 times. Every Shock result was the same printing (`msc`). | Not weighted by printing. The draw keeps `/cards/random`. |
| Arena printings | 20 of 20 draws with the default query list `arena` in `games`. | No change. The app still shows a note on any result that lacks `arena` when the query has `game:arena`. |
| Rebalanced cards | `f:standard game:arena` and `f:standard game:arena -is:rebalanced` both return 5,164 cards. `is:rebalanced` alone returns 404 (no cards), and no Standard Arena card name starts with `A-`. `-is:rebalanced` causes no warning. | `-is:rebalanced` stays in the default, as the plan says. It does not change the count today. |
| Query syntax | One real search for each table row (19 searches). None returned `warnings`. | No change. |
| Error responses | `mv>abc` returns status 404, code `not_found`, with the details "Your query didn't match any cards…" and no warnings. `c=q` returns status 400, code `bad_request`, details "All of your terms were ignored.", with one warning. | Mapping kept. Note that an invalid query like `mv>abc` gets the no-match message, because Scryfall reports it as a 404 `not_found`. |
| Arena import (manual task) | Not tested. | Manual task. |
| Names that differ on Arena (manual task) | No name field other than `name` appeared in 20 random draws. `game:arena has:flavorname` matches 134 cards with a `flavor_name`, for example Adeline, Resplendent Cathar with the flavor name "Hero of Light" (`fca`), and Marvel printings such as Arasta of the Endless Web. `printed_name` appears only on non-English printings. | The export uses `frontName` (the oracle name). A manual test in Arena confirms that oracle names import for these cards. |

## Changes from the plan

1. **`CardSnapshot` has two more fields**: `oracleText` and `imageStatus`. Reason: list rows and history show a text version when an image is missing or fails, and the snapshot did not have the rules text. This also lets the app apply the `image_status` rule to saved cards.
2. **New module `src/draw.js`**, not in the file layout. Reason: batch draw logic is testable without the DOM.
3. **New module `src/storage/memory.js`**. Reason: the memory fallback when IndexedDB fails, and tests for the storage interface in Node.
4. **New scripts**: `scripts/fetch-fixtures.sh`, `scripts/check-api.mjs`, and `scripts/make-icons.js`. These are development tools, not runtime dependencies.
5. **A second 429 also pauses the queue.** The plan says to reject the request after a second 429. The queue does that and also pauses for another 30 seconds, so the requests behind it don't run into the block. This is the more conservative choice.
6. **Free text is quoted for more than spaces.** The type line and keyword fields add quotes when the text has a space or one of `( ) : < > = !`. Rules text is always quoted, as in the table. Reason: these characters have meaning in Scryfall syntax.
7. **Two more hints in the query builder**: "Choose at least one color" when the color mode is not Any but no color is selected, and "Choose a color mode" when colors are selected with mode Any. Also a hint when the minimum mana value is more than the maximum.
8. **Empty query.** When all criteria are off, the app does not request a pool size (`/cards/search` needs a query) and shows "Add a criterion to see how many cards match." A draw with an empty query calls `/cards/random` with no `q`.
9. **Criteria collapse on phones.** The criteria panel is a disclosure that starts closed below 1000 px, so the Draw button is near the top of the page. The query preview always shows the full query.
10. **No sticky header.** The sticky header and panel are gone, so that nothing can cover a card image while the page scrolls.
11. **Readable format names.** `competitivebrawl` and `tlr` show only the key, because their names could not be confirmed.
12. **A rebalanced card fixture is missing.** Section 8 asks for a fixture of a rebalanced card. Scryfall returns no cards for `is:rebalanced` today, so the fixture `search-rebalanced.json` is the real 404 response. All other fixtures are real API responses. None is synthetic.
13. **Extra fixtures**: an adventure card, a snow basic land, a 400 response with warnings, a 200 List with warnings, and a 404 from `/cards/search`.

## Known problems

- In history rows, a long query can wrap at the hyphen in `-is:rebalanced`. The query preview wraps between terms, but history rows do not yet. (No longer applies: history rows don't show queries since the feedback round.)
- Removing an entry from a list happens at once, with no confirmation and no undo. The plan asks for confirmations only for deleting lists and presets and clearing history. (Fixed in the overhaul: Remove leaves an **Undo** row.)
- After the Lists view re-renders (for example after a quantity change), the app tries to keep focus on the same control. If a row moves because of sorting, focus can land on a different row.
- The refresh shows "Not found on Scryfall" only for the current session. After a reload, that marker is gone, but the old snapshots stay.
- Pool size requests for old queries are cancelled. If the debounce fires during a 30-second pause, the count waits until the pause ends.
- A batch draw with a small pool can stop early and say so. This is expected behavior, but the attempts still count against the rate limit.
- The repository is named `scryfall-app`. The app name rule in section 2 is about the app, but a GitHub Pages URL such as `https://<user>.github.io/scryfall-app/` contains "Scryfall". Consider renaming the repository before you turn on Pages.

## Manual tasks

1. Turn on GitHub Pages. The steps are in the README.
2. Test an Arena import. Paste an export that has a sideboard, a transform card, a modal double-faced card, and a split card into MTG Arena. Confirm that Arena accepts the `Sideboard` header and the front-face names (for a split card, the export writes only the left half, for example `Fire`).
3. Confirm in Arena that cards with a flavor name (for example Through the Omenpaths and Marvel printings) import by their oracle name.
4. Choose an app name. Change it in the places that the README lists.
5. Test on an iPhone: add the app to the Home Screen and confirm that lists stay.

# Design overhaul: Brewmancer (November 2026)

The app was renamed Brewmancer and rebuilt around the requests from an interview and a use session. The process: the interview and use session, six research agents, and an independent review. The research covered the tools in use, what else might be useful, UI and UX practice, platform needs, an audit of v1, and the Scryfall API. The working files (research, screenshots, and the plan) are in `.artifacts/design-overhaul/`, which git ignores.

## What changed

| Area | Change |
| --- | --- |
| Name and look | New name, icon colors, and a playful violet and teal look with rounded type. Card frames glow in the card's colors. The glow is on the frame around the image, never on the image. |
| Nerd mode | A switch in the header. Cards show mana value, stats, set, release date, price, EDHREC rank, and legality in Standard and Brawl. Explore shows its Scryfall queries. |
| Discover | Filter chips with remove buttons, and filters behind a Filters button. **Draw random** or **Browse all**: Browse lists every match in one of 11 orders, 175 cards at a time, with Load more. The first page in name order comes from the pool count, so that page costs no extra request. |
| Card details | A details sheet, and on screens 1200 px and wider, an inspector beside the results that follows the pointer or keyboard focus. They show rules text, a keyword glossary with MTG Wiki links, rulings on request, legality, printing, prices, buy links, and related links. Pointing at a card sends no request. |
| Explore | Replaces Find synergies. Three tabs: Synergies (for example "Green cards that leverage landfall"), Similar, and Counters. Searches combine Scryfall Tagger tags with keyword and rules-text terms. Search opens the results in Browse, most popular first. |
| Saved marker | Every card shows "Saved in" and the list name when one of the lists holds it, in any printing. |
| Lists | Export for Arena is the main button. Open on Scryfall opens a list (in parts for long lists). Rename, Refresh, and Delete are under More. Lists are collections or decks, and decks have a format: Standard, Standard Brawl, or Brawl. Brawl checks cover the commander, size, singleton, color identity, and legality. The Arena export for Brawl writes Commander and Deck blocks. Deck stats show the curve, colored mana symbols, and types. Remove leaves an Undo row where the card was. |
| Presets | A second built-in preset: Arena Brawl, with color identity. |
| Data | Snapshots keep detail fields (legalities, keywords, prices, buy links, and more). Backups are schema 2, and schema 1 backups still import. The IndexedDB schema didn't change. |

## Decisions

1. **Nothing floats over the page.** The research recommended a bottom tab bar on phones and a floating toast. Both would cover card images while the page scrolls, which v1 ruled out (item 10 above). The phone tabs are a row in the header, and the toast is in the page flow. The only sticky element is the inspector, which sits in its own column beside the cards. A browser check fails if anything else is fixed or sticky.
2. **Tagger tags with fallbacks.** Scryfall Tagger tags make synergy searches much tighter. For example, `otag:landfall c:g` found 46 cards in Standard on Arena, against 37 for `kw:landfall`. Tags are community data, so each search ORs the tag with keyword or rules-text terms, and every tag the app uses was checked live. `scripts/check-api.mjs` checks them again.
3. **Explore results open in Browse, sorted by EDHREC rank.** A synergy search is a list to look through, not a lottery. EDHREC rank measures paper Commander popularity, which is a rough guide for Arena.
4. **Counters ignore color.** Answers can come from any color, and a color filter can be added.
5. **Rulings load on request.** One request per card, cached for the session, so pointing at cards never sends requests.
6. **Brawl rules.** Brawl is Arena's 100-card format (Scryfall key `brawl`), and Standard Brawl is 60 cards (`standardbrawl`). The commander must be a legendary creature or planeswalker, or a card that says it can be a commander. The sideboard isn't exported for Brawl. On 2026-11-05 the API listed no rebalanced card as legal in Brawl.
7. **The glossary is short text, with links.** Each entry follows reminder text or the Comprehensive Rules, shortened. The details also link to the MTG Wiki and show the card's official rulings.

## Tests

- Unit tests: `npm test` runs 153 tests. All pass. New test files: `tests/explore.test.js`, `tests/glossary.test.js`, and `tests/overhaul.test.js` (saved index, deck stats, browse, and links). There are also new tests in the existing files: card snapshots, Brawl deck checks, formats and the commander section, backup schema 2, Brawl export, color identity, filter chips, settings, and the client's sort direction and rulings.
- New fixtures, all real API responses: a search page with more pages (`search-page.json`), rulings, a legendary creature, a planeswalker, a landfall creature, an enchantment payoff, and a flier.
- Browser checks: `node scripts/check-ui.mjs`. They cover the name, nerd mode, the header at phone width, filters and chips, the Arena Brawl preset, draw, the card image rules, the saved marker, the details sheet and its focus, the inspector, Explore tabs and keyboard use, the trip to Browse, Browse sort order and status, Export for Arena, Open on Scryfall, deck stats, Brawl checks and the Commander section, Remove and Undo, and that nothing floats over the page. All checks pass at 390 px and 1280 px, in light and dark mode.
- Review: an independent reviewer (Opus) read the branch and found 16 problems and 5 glossary errors. There were no hard-rule violations. Each fix started with a failing test:
  - Settings lost on every storage round trip.
  - Draws and Browse loads not cancelled on a mode switch.
  - Sorts mixed while a page was loading.
  - Cancelled requests overwriting newer ones.
  - Standard decks exporting in Brawl shape.
  - Focus lost after re-renders.
  - Wrong blink and ramp suggestions, and loose patterns for spells, removal, mana lands, and indestructible.
  - Missing Brawl rules: colorless commanders and "up to seven" cards.
  - Inspector and details focus.
  - Explore overwriting the saved sort.
  - No limit on the page cache.

  The reveal animation now leaves the image alone. Only the frame's glow and the caption animate.

  A second review pass confirmed the fixes and found four small problems the fixes introduced:
  - Focus after More, then Refresh.
  - The reason text for blink and ramp cards.
  - Basic land types with a colorless commander.
  - A rulings request that could be sent twice.

  Each of them is now fixed and tested.
- Written first: the unit tests for every new pure module and logic change, and the browser checks for the new interface. Each of them was run and failed before the code existed. Written after the code: the Arena Brawl preset check, the check that Dismiss moves focus to the heading, and the check that rulings are requested once per card. Each of them was broken on purpose to see the check fail, then the code was restored. The check that nothing floats over the page was written before the fix, but the first run stopped before reaching it. To see it fail, the toast was made fixed again, then restored. The tab bar checks were tightened after a bug: the first check tested only `position: fixed`, and the bar sat at the top of the screen. The stricter checks failed before the fix.

## Known problems after the overhaul

- Explore suggestions come from patterns in rules text plus community tags. Some are loose, and new mechanics may have no pattern yet. To see and adjust a search's query, open it in Discover, then select **Open on Scryfall**.
- Similar cards uses role, keywords, and type plus cost. It doesn't know a card's own Tagger tags, because those are only in a 6 MB bulk file. Loading that file could make Similar and Synergies much better. See `.artifacts/design-overhaul/research/R6-api.md`.
- Browse loads 175 cards a page, one request a page, so a big pool takes several Load more steps. Changing the sort reloads from page 1.
- Saved cards from v1 lack the detail fields. Their details show a note, and the Brawl checks say so, until **Refresh card data** is selected.
- The inspector appears only at 1200 px and wider. On an iPad in portrait, use Details.
- Prices are as of the moment the card was fetched. Saved cards keep old prices until a refresh.
- The repository name still contains "Scryfall". See the v1 problem above.

## Manual tasks (overhaul)

1. Import a Brawl export into MTG Arena, and confirm that Arena accepts the `Commander` and `Deck` headers.
2. Try the app on the iPhone and iPad, with the app on the Home Screen.
3. Consider renaming the repository, for example to `cascade`, before turning on GitHub Pages. The README's Pages steps are unchanged.

# Feedback round: Cascade (7 November 2026)

A try of the overhaul led to eight requested changes.

## What changed

| Area | Change |
| --- | --- |
| Name | Cascade, chosen by hand. The icon is three cards cascading down. |
| Look | A blend of GitHub's Primer and Vercel's Geist: neutral grays, the system font, 6px corners, 1px borders, a blue accent for links, focus, and selection, and black (light mode) or white (dark mode) primary buttons. The gradients, the violet and teal palette, and the colored glows around card frames are gone. Controls are 32px high with a mouse and keep 44px for touch. |
| Nerd mode | A tooltip says what it does. It shows on hover and on keyboard focus, the switch points to it with `aria-describedby`, and Escape hides it. The native `title` tooltip is gone, so there's only one. |
| Help | A new **Help** view with seven pages. The text is in `src/docs.js`, a pure module, and the nerd mode tooltip and its help page share one constant. `tests/docs.test.js` checks the pages against the real limits and for removed features. `AGENTS.md` now tells agents to always check every doc surface after a change. |
| Draw | Up to 30 cards (was 10). Redraws prefer cards that weren't drawn recently for the same search, using the draw history. If the pool has 175 cards or fewer and its size is known, the app draws from one search page, and every new card comes before any recent one. Bigger pools use the random endpoint as before, set recent cards aside, and use them only when the tries run out. The app says how many recent cards it had to use. |
| Query | The query preview and **Copy query** are gone from Discover. Explore and Recent draws no longer show queries in nerd mode. **Open on Scryfall** stays, next to the match count. |
| Chips | A search from Explore carries a readable label, for example "Works with Lotus Cobra: Green cards that leverage landfall", and its chip shows that label instead of the syntax. Editing the search by hand drops the label. Typed syntax shows as "Custom search". The filter field is now called **Scryfall search**. |

## Decisions

1. **Recent means the draw history.** The history already stores the query with each card, so "recently drawn for the same query" needs no new storage. The history keeps the last 100 cards, so after a few big draws the oldest drop out. For a small pool this is plenty, and for a big pool repeats are rare anyway.
2. **Small pools draw from a search page.** The random endpoint can't be told which cards to skip, so in a small pool a redraw would mostly get recent cards back and waste requests. One search page holds the whole pool, costs one request (none if the pool count already fetched it), and lets the draw take every new card first. It also makes the redraw behavior testable in the browser checks.
3. **The criteria label didn't raise the backup schema.** Criteria now have an optional `rawLabel` string. Older schema 2 apps drop it on import, and this version reads older backups without it, so `BACKUP_SCHEMA_VERSION` stays 2.
4. **No web font.** Geist uses the Geist typeface, but loading it would add an outside request. The app uses Primer's system font stack instead.
5. **No third person in the docs.** No doc uses third-person words such as "she" or "the owner". A test in `tests/docs.test.js` fails if one does. (A later change also removed the first person. See "Agent instructions" below.)

## Tests

- Written first, and seen failing before the code: the unit tests for the 30-card limit, recent keys, the recency rules in a batch draw, small-pool sampling, the readable chip label, the Explore label, and the help pages (`tests/docs.test.js`). Also the browser checks for the name, the tooltip, Help, the hidden query, the 30-card limit, the redraw, the Explore chip, and the clean look.
- The first browser run stopped at the missing tooltip, so the checks after it didn't run before the code existed. To prove they can fail, the finished code was broken on purpose in a copy of the app, one change for each check, and the checks ran once. Each one failed. The first redraw check passed by chance against that break, because the pool was big enough, but the second redraw check caught it.
- Changed after the code: the check that nothing covers the card image now scrolls the image into view first. The old check sampled a point above the image when the image started below the middle of the screen, and the new layout exposed that. The Details and inspector checks now read the card name after the redraw check replaces the cards. The image check was seen failing with an element placed over the image.

## Known problems after this round

- A draw of 30 from a big pool takes at least 15 seconds, and longer when it has to skip recent cards. **Cancel** stays available.
- In a big pool, a redraw can still repeat a recent card when the random endpoint keeps returning recent ones until the tries run out. The app says so when it happens.

# Combos, first version: links to Commander Spellbook (7 November 2026)

The request was a combo feature like [Commander Spellbook](https://commanderspellbook.com). Every feature on their site was reviewed, the wanted ones were picked, and the first version uses links only. Issue #5 has the plan for the rest, with every feature that was picked.

## What changed

| Area | Change |
| --- | --- |
| Explore | A fourth tab, **Combos**, with links to Commander Spellbook searches: combos with the card, and for a legendary creature or planeswalker, combos in its colors. Links open in a new tab. |
| Details | **Combos on Commander Spellbook** under Links. |
| Lists | **Find combos** copies the list in the format their Find My Combos page reads, with a link to that page. A Brawl deck with a commander also gets links for its commander. |
| Help | A new **Combos** page: how to find combos, what each bracket tag means (Ruthless, Spicy, Powerful, Oddball, Core, Exhibition, Not legal), combo terms, and the credit. |
| Code | `src/combos.js`, a pure module, builds the links and the decklist text. `SPELLBOOK_SITE` is in `src/config.js`. |

## Decisions

1. **Links only, for now.** Their API allows browser requests only from commanderspellbook.com and from localhost, so it would work in local tests and fail on GitHub Pages, and a proxy would break the no-server rule. Their bulk data file can be read from any site, but it's about 730 MB unpacked, and no license for the data could be found. `PLAN.md` says Scryfall is the only data source. That still holds: the app only links to another site, as it already does for EDHREC.
2. **Every search names a format.** Without one, their site adds Commander. Searches use the format of the current Discover search, or a deck's own format on a list. Formats they don't track, such as Historic and Timeless, fall back to Commander, and the link says so.
3. **Full card names.** Their names match Scryfall's full names, including both faces of a double-faced card. This and the search terms were checked on their live site.
4. **No Combos view yet.** A Combos view of its own is wanted, but with links only it would hold nothing the other three places don't already have. It's in issue #5, with the combo search and random combos it will hold.
5. **Find My Combos takes pasted text.** Their page can't be filled in from a link, so the app copies the list for the user to paste. Their own site writes the decklist the same way: commanders go after a `// Commanders` line.

## Tests

- Written first, and seen failing before the code: the unit tests in `tests/combos.test.js`, the help page tests in `tests/docs.test.js`, and the browser checks for the Combos tab, the details link, Find combos, and the Combos help page.
- The first browser run failed on the four tabs, the Combos links, and the details link. Then it stopped at the missing **Find combos** button, so the Find combos and Help checks didn't run before the code existed. The "no query syntax" check passed then only because the tab didn't exist yet.
- To prove those checks can fail, the finished code was broken on purpose, and the checks ran once. The breaks: a search term in a Combos reason, the Find My Combos link pointed at the wrong page, no focus move, focus sent to the wrong button on Close, and a renamed help page. All five checks failed. Then the code was restored.

## Known problems

- Find My Combos shows combos legal in Commander unless its filter is changed on their site. The panel says so.
- The links can't show how many combos a card has, because the app has no combo data.

# Docs audit (7 November 2026)

Every doc was checked against the code. Most of the fixes were small: missing links and labels, the backup reminder rule, and the app name written out in the help pages instead of using `APP_NAME`. The profile doc was also removed. The audit found four changes from `PLAN.md` that this report never recorded:

| Area | `PLAN.md` | Now |
| --- | --- | --- |
| Draw count | The default is 1. | The default is 3. |
| Card tiles | The set name, the rarity, a **View on Scryfall** link, and an **Add to list** button. | **Details**, **Explore**, and **Add**. The set and rarity show in nerd mode, and **View on Scryfall** is in the details. |
| Prices | Out of scope. | Prices and buy links in the details, and the price in nerd mode, all from Scryfall. |
| Modules | The file layout in section 3.2. | New pure modules: `synergy.js`, `explore.js`, `browse.js`, `saved.js`, `stats.js`, `links.js`, `glossary.js`, `docs.js`, and `combos.js`. New UI modules: `details.js`, `explore-panel.js`, and `help-view.js`. `README.md` lists them all. |

## Decisions

1. **Query syntax stays out of the main interface only.** The **Scryfall search** field's hint shows example syntax, and Scryfall's warnings quote the typed query. Both help someone writing a query, so they stay. Chips, Explore, results, and history use plain words. `AGENTS.md` has the rule.

## Tests

- Written first, and seen failing before the fixes: the help page tests for `APP_NAME`, Get started, the backup reminder, and the combo format note, and the browser check for the **Explore** button's label.
- Fixed after the fix: the test for the details links first read the wrong help page. It was pointed at the right one after the docs were fixed, so the docs were broken on purpose to see it fail.
- Added after the code: the test that no doc points to a profile doc, and the test that code comments avoid the third person. Neither found anything wrong in the comments, so a bad line was added on purpose to see each one fail.

# Agent instructions (7 November 2026)

The agent instructions were rebuilt so that every agent gets the same rules: Claude Code, OpenAI Codex, GitHub Copilot, and agents in Superset workspaces. Before, some rules were only in a global Claude file and in local git hooks, so other agents and cloud sessions never saw them. The plan, and the choice for each part, came from a page with inputs.

## What changed

| Area | Now |
| --- | --- |
| `AGENTS.md` | Under 200 lines. It keeps every hard rule in short form and links to the detail. |
| `.claude/rules/` | Six rules. GitHub voice and shipping load every time. Design, Scryfall API, storage and backups, and help docs load when Claude Code touches their files. Other agents open them from the links in `AGENTS.md`. |
| `.agents/skills/` | Two shared skills: **ship** and **plan-with-options**. Codex reads them there. Claude Code reads them through the `.claude/skills` link. |
| `.claude/settings.json` | No attribution in commits or pull requests, no session links, and a prompt before any force push. |
| `.gitignore` | Keeps the shared `.claude` files in git, even where a global ignore hides `.claude`. Personal files such as `.claude/settings.local.json` stay ignored. |
| Voice | No first person and no third person anywhere: docs, help pages, interface copy, code comments, and GitHub. The confirm button for a backup import that replaces everything now says **Replace all data**. |

## Decisions

1. **Force pushes ask instead of being blocked.** A hard block would also stop the one allowed history rewrite: removing a session link. A prompt keeps that possible, with approval each time.
2. **No hooks for now.** Hooks are a later body of work. [Issue #9](https://github.com/armstrongl/scryfall-app/issues/9) holds the plan.
3. **No GitHub workflow for now.** [Issue #10](https://github.com/armstrongl/scryfall-app/issues/10) holds the plan for a check that runs on every pull request.
4. **No edits to old upgrade steps** stays a written rule, not a setting. A permission rule can't tell a new upgrade step from an edit to an old one.
5. **`PLAN.md` changed only its voice.** What it specifies is unchanged.
6. **Simplified Technical English** applies to pull request descriptions and issue bodies.
7. **Icons and motion are rules first.** `.claude/rules/design.md` now asks for icons on most buttons, with labels, and subtle fades. [Issue #11](https://github.com/armstrongl/scryfall-app/issues/11) holds the work to apply them to the app.

## Tests

- Written first, and seen failing before the change: `tests/agent-docs.test.js`, for the rules, their paths, the links in the agent docs, the skills, the settings, session links, and the first person in docs, help pages, interface copy, and code comments.
- Passed before the change, so they were proved able to fail by breaking the code on purpose: the length of `AGENTS.md`, the `CLAUDE.md` import, rule paths that match files, links that resolve, no session links, and no first person in help pages.
- Added after the code: the test that git keeps the shared `.claude` files. It failed with the old `.gitignore`.
- Fixed after an Opus review, each bug reproduced first:
  - The `.gitignore` test passed for committed files no matter what. It now checks with `--no-index` and a global ignore like the one on the development machines, and it also checks that personal files stay ignored.
  - `tests/agent-docs.test.js` crashed in a copy with no git, such as a ZIP download. It now walks the folder instead.
  - A stray file, such as `.DS_Store`, in `.agents/skills/` broke `tests/docs.test.js`.
  - The interface copy test missed strings in the pure modules and strings that span lines. It now reads every module in `src/` whole.
- Changed: the third-person test in `tests/docs.test.js` now also reads the rules and skills, and leaves out quoted words, so that a rule can name the words it bans. A rule with an unquoted "she" made it fail.

## Known problems

- Claude Code reads the rules on its own. Codex and Copilot read only `AGENTS.md` on their own, and must follow its links to the rules.
- The checks for voice and session links run in `npm test`, not on GitHub. An agent that skips the tests can still break them until the work in [issue #10](https://github.com/armstrongl/scryfall-app/issues/10) is done.

# Help links, tooltips, and the copy index (7 November 2026)

The requests: link the help pages to useful sites, add more tooltips, keep an index of the interface copy for audits, and keep the first person out of the docs and the app's text, while still following technical writing and interface copy practice. Four related changes were picked as well: links between help pages, **Learn more** links from the app, a Glossary page, and linked card names.

## What changed

| Area | Change |
| --- | --- |
| Help links | Help text takes `[label](url)` links. Links to other sites open in a new tab and say so to screen readers. Links to `#help/…` open another help page. Any other target stays plain text. Every page now links the sites, apps, formats, terms, and cards it mentions: 123 links to 61 addresses, mostly on Wizards of the Coast, Scryfall, Commander Spellbook, and the MTG Wiki. |
| Glossary | A new **Glossary** help page with 35 Magic terms in five groups, each with a link to learn more. |
| Tooltips | `withTip()` and `infoTip()` in `src/ui/dom.js`. Tooltips on Apply, Save as preset, Draw random, Browse all, Open on Scryfall, Export for Arena, Find combos, a list's Open on Scryfall, and Refresh card data. **?** buttons explain eight filters, a list's kind, the Add panel's sections, EDHREC rank in the details, and the storage line in Data. The text is `TIPS` in `src/docs.js`. The nerd mode tooltip uses the same code now. |
| Learn more | `helpLink()` links from Explore, the Combos tab, the filters, Find combos, the deck checks, the details, and the Data view to the matching help page. In a dialog, the link closes the dialog first. |
| Copy index | `scripts/ui-copy.mjs` writes `docs/ui-copy.md`: where each kind of copy lives, every tooltip and where it's used, the help pages, and every text in `index.html`, `src/main.js`, and `src/ui/`. `npm test` fails when the index is out of date. |
| Link check | `scripts/check-links.mjs` checks every help link against the live web, including `#fragment` targets. |
| Voice | The new help text, tooltips, and Glossary speak to the reader as "you" and never use the first person, like the rest of the docs since the agent instructions round. |

## Decisions

1. **The copy index is generated, not written by hand.** A hand-kept list goes stale on the first change nobody remembers to copy into it. The generator reads the source as text, and a test compares its output with the committed file. It has no line numbers, so its diff shows only the copy that changed.
2. **The extractor is a heuristic.** It finds strings by their context (`text:`, `aria-label`, `announce()`, `message()`, and more) and keeps other strings that read like prose. It skips short lowercase words, such as "never" from `formatDate()`. The index says so, and the table at its top names the pure modules that hold the rest of the copy.
3. **No tooltips on card tiles.** A tooltip there would cover a card image. Tooltips go below their control, or above it when below would leave the screen or cover a card. The browser checks test this for every tooltip.
4. **? buttons for fields, hover tooltips for buttons.** A tap on a touch screen doesn't show a button's tooltip, because the tap already runs the action. A ? button shows its tooltip on click or tap. Tooltip text is never the only place the information lives: the help pages say it too.
5. **Escape closes a tooltip first.** In a dialog, the first Escape closes the open tooltip and the second closes the dialog.
6. **? buttons meet the tap target size.** The circle is 18px, but its tap target is `--tap` square: 44px on touch screens and 32px with a mouse. Where the target overlaps a field or checkbox, the field sits on top and keeps its clicks.
7. **Tooltips close when they'd be in the way.** A button's tooltip closes when the button is used, so new cards never show up under it. If a tooltip can't be placed clear of every card image, it doesn't show. A tooltip removed by a re-render doesn't hold on to the next Escape.
8. **Many links, on purpose.** The request was to err on the side of more links, so terms are linked inline even when a page links the same site twice. An independent review suggested fewer links. The Glossary keeps one place for each term's definition.
9. **Links prefer official sources.** Wizards of the Coast pages for formats, brackets, and the Game Changers list, then Scryfall and Commander Spellbook, then the MTG Wiki for terms. MTG Wiki titles were checked through its API, because the wiki blocks scripted page requests.

## Tests

- Written first, and seen failing before the code: the unit tests for link markup, help links, the Glossary, tooltips, help links from the app, and the first-person rule (`tests/docs.test.js`), and the copy index tests (`tests/ui-copy.test.js`). The browser checks for tooltips in Discover, Lists, and Data, the ? buttons, the Explore button's name, and the Learn more links in the filters, details, Explore, Find combos, the deck checks, Data, and the Add panel all failed on the first run.
- Some unit tests passed before their code, because there were no links yet: the checks that unsafe links stay plain text, that `pageText` drops link markup, and that help links point at pages that exist. Each was broken on purpose (allowing `http:` links, keeping the markup, linking a missing page), seen failing, and restored. So were the copy index tests (one tooltip left out) and `scripts/check-links.mjs` (a misspelled wiki page).
- The first browser run stopped before the Help checks. To prove they can fail, the Help view was broken on purpose: no "opens in a new tab" text, help page links sent to the wrong page, and the Glossary renamed. Each check failed, then the code was restored.
- The tap target check for ? buttons was written after a rule for 44px targets landed on `main`, and failed on every ? button before the CSS changed.
- An Opus review found a tooltip that could stay open over new cards, open tooltips that swallowed Escape after a re-render, a ? button that joined the Mana value group's name, and a ? button that needed two presses from the keyboard. Each got a browser check first, seen failing, then the fix. The Escape and keyboard checks were also broken on purpose after the fix, to see them fail for the right reason. The review's copy notes are fixed too: the storage tooltip, **Any** in the color mode help, snow-covered basics, special rarities, and "many buttons" in Get started. The extractor now decodes `\u` escapes, with a test, and a test checks that it finds every `announce()` and `aria-label` in three UI files.
- `node scripts/check-ui.mjs` passes at 390 px and 1280 px, in light and dark mode. `node scripts/check-links.mjs` finds no broken links.

## Known problems

- Cardmarket and Cardhoarder answer scripts with 403, so the link check can't verify them. It lists them as unchecked.
- The help pages and the app's keyword links point to the MTG Wiki on Fandom (`mtg.fandom.com`), while `.claude/rules/help-docs.md` names `mtg.wiki`. Both sites work. Moving every link to one host is still open.
- The Glossary and the tooltips explain terms in the app's own words. Check them against the linked sources when the rules change.

# GitHub sync (12 November 2026)

The request: persistent storage that works across devices. The plan was agreed on a page with inputs, and every item was kept: a private GitHub repository, a pasted token, pull, merge, and push, deletion markers, sync status in **Data**, a rules file, and the docs. The answers chose sync on open, a few seconds after each change, and from **Sync now**; lists, presets, and settings; and the newer change winning.

## What changed

| Area | Change |
| --- | --- |
| Sync | **Data** has a **Sync with GitHub** section. It connects to a private repository with a fine-grained token, and shows the last sync time or the error. The app keeps one file, `card-discovery-sync.json`, in the repository. `src/storage/sync.js` reads it, merges it with the device's data, saves the result on the device, and writes it back. |
| GitHub client | `src/github.js` is the only code that calls `api.github.com`. It uses the repository contents API and sends the old sha with every write. When GitHub refuses a write because the file changed, the sync reads, merges, and writes again, up to 3 times. |
| Merge | `src/sync.js` (pure). Lists and presets merge by ID with the newer `updatedAt`. The synced settings (nerd mode, Draw or Browse, and the Browse sort) come from the side that changed them last. History, the last search, the last list used, and the backup date stay on each device. |
| Deletes | A delete now leaves a marker (ID, kind, and date) in a new `deletions` store, so a delete reaches other devices. Saving the item again, such as with Undo, removes the marker. Markers older than 90 days are removed at sync. |
| Storage | IndexedDB version 2 adds the `deletions` store. The version 1 step is unchanged. The GitHub connection and token are in the `sync` record of the `meta` store, apart from the settings, so they are never in a backup. An import that replaces everything keeps the connection. |
| Backups | Backup schema 3 adds `deletions`. Schema 1 and 2 backups still import. A schema 3 backup is also a valid sync file, and the sync file imports as a backup. |
| Docs | A **Sync with GitHub** help page, a tooltip for the token field, the **Your data** page and `README.md` updated, a new rules file (`.claude/rules/github-sync.md`), and new lines in `AGENTS.md` and the storage rules. |

## Changes from the plan

1. **`PLAN.md` section 1 puts sync out of v1 scope, and section 6 names two candidates: a hosted database with sign-in, or a small private server.** Sync now uses neither: it uses a private GitHub repository that belongs to the user, with no server. Reason: it adds no service, account, or server to run, and the data stays in a place the user controls.
2. **Deletes are no longer permanent.** `PLAN.md` section 6 asks a sync version to add deletion markers, and this change does.
3. **Backup schema 3 and IndexedDB version 2.** Both were approved in the plan page before the build.

## Decisions

1. **A pasted token, not "Sign in with GitHub".** GitHub's sign-in endpoints on `github.com/login/` send no CORS headers, so a page on GitHub Pages can't use them without a server. The API at `api.github.com` allows requests from any site. Both were checked with `curl` on 12 November 2026.
2. **A private repository, not a gist.** A secret gist can be read by anyone with its link, a token for gists can change every gist in the account, and gist writes don't check the sha. Connect refuses a public repository.
3. **The token link fills in the form.** It uses GitHub's [template URL parameters](https://github.blog/changelog/2025-08-26-template-urls-for-fine-grained-pats-and-updated-permissions-ui/) for the name, account, a 366-day expiry, and Contents write. The repository itself is chosen on GitHub's page.
4. **The last search doesn't sync.** It changes with every filter change, and each write is a commit. Only nerd mode, Draw or Browse, and the Browse sort sync. `syncSettingsAt` dates the last change to one of them.
5. **Sync status redraws only Data.** A sync redraws Lists and Discover only when it changed data on the device, so that editing a list isn't interrupted.
6. **Background errors show once.** A failed background sync shows in **Data**. When the cause needs a fix, such as an expired token, a message also shows, once for each kind of error. Network errors show in **Data** only, because they fix themselves. **Sync now** shows its result as a message.
7. **The browser checks fake GitHub.** `scripts/check-ui.mjs` answers every request to `api.github.com` through the DevTools Fetch domain, with the CORS headers that GitHub sends.

## Tests

- Written first, and seen failing before the code: `tests/sync.test.js` (27 tests). They failed as a group, because the modules didn't exist. To see single tests fail for the right reason, the code was then broken on purpose three times: no deletion marker on delete (3 tests failed), writes without the old sha (4 failed), and the token in exported backups (1 failed). The code was restored each time.
- Written first: the browser checks for the **Sync with GitHub** section, Connect, a refused token, Sync now with a list from another device, sync after a change, Disconnect, and focus. They failed on the first run because the section didn't exist.
- The browser check for the IndexedDB upgrade was written before the UI, but after the upgrade step. Its first run failed because of a bug in the check itself (the test server sends `README.md` as a download). After that fix, it passed.
- Changed after the code: two tests in `tests/export.test.js` that expected schema 2.
- An Opus review found races and gaps. Each got a test first, seen failing, then the fix: the app now reloads as soon as a sync changes local data, before the write to GitHub (before, an edit during the write could undo the data that the sync brought in); a Disconnect during a sync no longer brings the token back; a save between a sync's read and write of local data now makes the sync start over, and a sync no longer rewrites history; Replace import while connected now wins on GitHub too; a token that can read but not write no longer stays connected; and a secondary rate limit and other 422 answers get the right error. A browser check for focus on **Sync now** failed before the button changed from `disabled` to `aria-disabled`. The test that a sync that throws doesn't block the next one passed before its change, because the cycle already caught the error. The queue still got a `catch`, in case the error handling itself fails.
- Fixtures: real GitHub responses for a repository, a file, a missing file, and a refused token, fetched by `scripts/fetch-fixtures.sh` from a public repository. No fixture exists for a successful write or a 409, because those need a token. The fake GitHub builds them in the shape that the [contents API docs](https://docs.github.com/en/rest/repos/contents) give.

## Known problems

- No test has run against a real repository with a real token. The request and response shapes come from the docs and from responses that need no token.
- A device that doesn't sync for more than 90 days can bring back a list that another device deleted.
- Each list syncs as a whole. When the same list changes on two devices between syncs, the copy that changed last wins, and the other device's changes to that list are lost. The help page and README say so.
- The merge compares dates from each device's clock. A device with a clock that is far wrong can win, or lose, against a later change on another device.
- A sync reads local data again just before it writes, but a save in the moment between that check and the write can still be replaced. The gap is one storage call long.

# Changelog and pull request checks (12 November 2026)

`CHANGELOG.md` lists the notable changes by date. `.github/workflows/check.yml` runs two checks on every pull request, and a ruleset on `main` makes both required:

- `test` runs `npm test` on Node.js 20.
- `changelog` runs `scripts/check-changelog.mjs`. It fails unless the pull request changes `CHANGELOG.md` and links to itself there. The `no-changelog` label skips it.

## Decisions

- The ruleset is a repository setting. `AGENTS.md` keeps agents out of repository settings, but this one was requested, so it is the one recorded exception.
- The changelog check fails when a pull request opens, because the entry needs the pull request number. Agents push the entry after they open the pull request.
- The `no-changelog` label replaced a unit test that needed an entry for every pull request in the git history. That test would fail on every later pull request after one labeled merge. The `changelog` check now does the job before each merge.
- The check compares the merge commit that GitHub checks out with its first parent, `main`. The base commit in the event data can be older than `main`, and then the diff would include other merged changes.
- Event data, such as labels, reaches the script through environment variables, never straight into a shell command.

## Known problems

- [Issue #10](https://github.com/armstrongl/scryfall-app/issues/10) still has the checks for pull request titles, descriptions, and commit messages.
- `node scripts/check-ui.mjs` doesn't run on GitHub. It needs Chrome and live Scryfall requests.
