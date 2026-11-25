---
paths:
  - "scripts/check-ui.mjs"
---

# Browser tests

`scripts/check-ui.mjs` drives the real app in headless Chrome over the DevTools protocol, with no packages. `AGENTS.md` has the commands and what a UI check must show. This file says where a new check goes, how to write one, and the traps that past checks fell into.

## Layout of the script

- **Static server** serves the repository on a free port. Files with an extension not in `TYPES` go out as downloads: the first IndexedDB upgrade check failed because `README.md` downloaded instead of opening ([pull request #32](https://github.com/armstrongl/scryfall-app/pull/32)).
- **Chrome** starts Chrome with a new, empty profile for each width and color scheme, and `connect()` gives `ev`, `until`, `key`, `send`, and `on`. Every console error or warning goes into `b.errors`, and the run fails on "no console errors".
- **Checks** holds one `async function name(b, check)` for each area, such as `browse()` or `deckMode()`. Shared helpers are at the top: `click`, `clickText`, `setValue`, `hover`, `tooltipsIn`, `QUERY`, and `CHIPS`.
- **Fake GitHub** answers every request to `api.github.com` through the DevTools Fetch domain. Sync checks use it, never the real API ([GitHub sync](github-sync.md)).
- **Runner** calls each check function in order for every config, then runs `upgrade()` once in its own Chrome. `ONLY` with `SCHEME` limits the configs; the upgrade check still runs.

## Writing a check

- Put a new area in its own function in **Checks**, with a doc comment, and call it from **Runner**. Checks that reload the page, such as `moreFilters()` and `deckMode()`, run after the checks that need drawn cards. Keep new reloading checks there too.
- Call `check(name, ok, detail)`. Write the name as the behavior in plain words, and pass a `detail` that says what the page showed, so a failure explains itself.
- Wait with `until(expression, ms)`, not a fixed `sleep`, where a state can be read. The default is 20 seconds.
- Card images stay whole: check with `elementFromPoint` that the image is the element on top, and that `filter`, `transform`, and `clip-path` are `none` and `object-fit` isn't `cover`, as the sample hand check does. A check fails if anything other than a dialog, the inspector, or the skip link is fixed or sticky ([pull request #1](https://github.com/armstrongl/scryfall-app/pull/1)).
- Every tooltip in a view goes through `tooltipsIn()`: hover, focus, click for ? buttons, inside the screen, over no card, and closed by Escape.

## Proving a check can fail

- Write the check before the UI and see it fail on the old app. `REPORT.md` records this for each change.
- For a check added after the code, turn the fix off, see the check fail, and restore it. Running it against the view from `main` also counts ([pull request #36](https://github.com/armstrongl/scryfall-app/pull/36)).
- A check that passes on the old app proves nothing. The rename and delete check for the newest set preset passed before the code, because the select fell back to **Arena Standard**. It now also checks that the preset is selected ([pull request #60](https://github.com/armstrongl/scryfall-app/pull/60)).
- When a case can't be driven from the script, say so in `REPORT.md`. Deck mode records that no check can press **+** between the cards of a draw.

## Known traps

- Setting `location.hash` or calling `Page.navigate` to the same address with a new hash doesn't reload the page. Use `b.send("Page.reload", {})`. A reload check that used a hash could never fail ([pull request #38](https://github.com/armstrongl/scryfall-app/pull/38)). Wait for the IndexedDB save before the reload, as `moreFilters()` does.
- Random draws can lack data, such as a USD price or a Buy link. Check data like that on a card chosen for it, as `PRICED_BUY` in `browse()` does ([issue #57](https://github.com/armstrongl/scryfall-app/issues/57)).
- Images that load late can move the page under the pointer after `scrollIntoView`, so a hover can miss its control ([issue #57](https://github.com/armstrongl/scryfall-app/issues/57)).
- Anything that waits on Scryfall waits in the queue behind other requests. Give it a longer timeout, and report which requests the page sent on a failure, as the newest set check does with `performance.getEntriesByType("resource")` ([pull request #60](https://github.com/armstrongl/scryfall-app/pull/60)).

## IndexedDB upgrades

- `upgrade()` runs once, in its own Chrome, after every config. [Storage and backups](storage-and-backups.md) says what a new upgrade step needs from it.

## Scryfall requests

- The app sends real Scryfall requests through its own queue, so a full run takes minutes. Don't add requests a check doesn't need.
- Only one agent's run may call Scryfall at a time. [Work beside other agents](shipping.md#work-beside-other-agents) says when and how to use `scripts/scryfall-lock.sh`.
