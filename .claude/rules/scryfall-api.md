---
paths:
  - "src/scryfall.js"
  - "src/explore.js"
  - "scripts/check-api.mjs"
  - "scripts/fetch-fixtures.sh"
---

# Scryfall API

The [Scryfall API](https://scryfall.com/docs/api) is the app's only source of card data. Breaking these rules can get the user's IP address blocked. `PLAN.md` section 2 has the sources.

## The queue

- Every request to `api.scryfall.com` goes through the queue in `src/scryfall.js`. No other module calls `fetch` for the API. `tests/api-boundary.test.js` fails when another module in `src/` names `api.scryfall.com` or `API_BASE`, or when a module other than `src/scryfall.js` and `src/github.js` calls `fetch`. In Claude Code, a hook blocks the edit.
- One request at a time, at least 500 ms between request starts, and after a 429 a 30-second pause, then one retry. Don't lower these values. See [rate limits and good citizenship](https://scryfall.com/docs/api/rate-limits).
- `createClient()` takes `fetchImpl`, so tests pass a fake fetch instead of mocking a global.
- The queue spaces the requests of one run. Two runs at once double the rate from the same IP address. When several agents work at the same time, run `scripts/check-ui.mjs`, `scripts/check-api.mjs`, and `scripts/fetch-fixtures.sh` through `scripts/scryfall-lock.sh`, so that only one runs at a time. `tests/scryfall-lock.test.js` tests the lock.

## Headers

- Send the `Accept` header (`ACCEPT_HEADER` in `src/config.js`) on every request.
- Never set `User-Agent` in browser code. Scripts that run in a terminal send `CardDiscoveryDev/0.1`, with no email address.

## Data

- Never invent card data, IDs, or API behavior. Check against the live API or the [API docs](https://scryfall.com/docs/api).
- Fixtures in `tests/fixtures/` are real responses. To add one, add it to `scripts/fetch-fixtures.sh`, and fetch it with the headers above and the 500 ms spacing.
- Saved cards are snapshots. Don't fetch them again on your own. They're refreshed only when the user selects **Refresh card data**.

## Tagger tags

- Explore and the **What the card does** filter (`CARD_ROLES` in `src/query.js`) use only the [Scryfall Tagger](https://tagger.scryfall.com) tags in `VERIFIED_TAGS` in `src/explore.js`.
- Before you add a tag, check it against the live API. `node scripts/check-api.mjs` checks them all again.
- Tagger tags are kept by the community. A wrong tag gets an issue in this repository. Don't report it on Scryfall unless the session approves it.

## Printings

- Scryfall checks most terms against one printing at a time: `game:`, `year`, `e:`, `r:`, and `usd`. A card matches when one printing matches all of them. So `game:arena year<=2001` loses [Opt](https://scryfall.com/search?q=%21%22Opt%22), whose 2000 printing isn't on Arena.
- `in:arena` checks every printing of the card. The **First printed** filter uses `in:` with `year` and `not:reprint`. `scripts/check-api.mjs` checks the Opt case again.
- Scryfall regular expressions (`o:/…/`) match line by line, so `^` and `$` don't anchor the whole rules text. **Number of abilities** counts line breaks (`\n`) instead.
