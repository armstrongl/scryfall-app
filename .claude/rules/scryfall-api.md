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

- Every request to `api.scryfall.com` goes through the queue in `src/scryfall.js`. No other module calls `fetch` for the API.
- One request at a time, at least 500 ms between request starts, and after a 429 a 30-second pause, then one retry. Don't lower these values. See [rate limits and good citizenship](https://scryfall.com/docs/api/rate-limits).
- `createClient()` takes `fetchImpl`, so tests pass a fake fetch instead of mocking a global.

## Headers

- Send the `Accept` header (`ACCEPT_HEADER` in `src/config.js`) on every request.
- Never set `User-Agent` in browser code. Scripts that run in a terminal send `CardDiscoveryDev/0.1`, with no email address.

## Data

- Never invent card data, IDs, or API behavior. Check against the live API or the [API docs](https://scryfall.com/docs/api).
- Fixtures in `tests/fixtures/` are real responses. To add one, add it to `scripts/fetch-fixtures.sh`, and fetch it with the headers above and the 500 ms spacing.
- Saved cards are snapshots. Don't fetch them again on your own. They're refreshed only when the user selects **Refresh card data**.

## Tagger tags

- Explore uses only the [Scryfall Tagger](https://tagger.scryfall.com) tags in `VERIFIED_TAGS` in `src/explore.js`.
- Before you add a tag, check it against the live API. `node scripts/check-api.mjs` checks them all again.
- Tagger tags are kept by the community. A wrong tag gets an issue in this repository. Don't report it on Scryfall unless the session approves it.
