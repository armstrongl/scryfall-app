---
paths:
  - "src/cards.js"
  - "src/query.js"
  - "src/synergy.js"
  - "src/browse.js"
  - "src/draw.js"
  - "src/saved.js"
  - "src/buy.js"
  - "src/deck-import.js"
---

# Card data

These rules cover the card model once a [Card object](https://scryfall.com/docs/api/cards) is in hand: snapshots, keys, faces, printings, colors, prices, and the query that finds cards. Requests, headers, and Tagger tags are in [Scryfall API](scryfall-api.md).

## Snapshots

- `makeSnapshot()` in `src/cards.js` turns a Card object into the `CardSnapshot` that lists, draws, and history keep. `PLAN.md` section 5.1 defines it. `oracleText` and `imageStatus` are additions, so a saved card can show its text version without a request (`REPORT.md`, deviation 1).
- The detail fields (`legalities`, `keywords`, `prices`, `purchaseUris`, `games`, and the rest) came with backup schema 2. Older snapshots don't have them, so code that reads them must allow `undefined`. `buyList()` counts such cards as `oldData` ([#51](https://github.com/armstrongl/scryfall-app/pull/51)).
- Only **Refresh card data** replaces a saved snapshot (`AGENTS.md`, hard rules), and it keeps each entry's quantity, section, and note (`PLAN.md` section 5.7). Legality comes from the snapshot too: [Decks and formats](decks-and-formats.md) has the rules.
- Code that needs a card field reads the snapshot. A new field goes in `makeSnapshot()` with a test for each fixture it changes. Changing what a backup holds follows [Storage and backups](storage-and-backups.md).

## The same card

- To ask whether two entries are the same card, compare `cardKey()`, never `id`: every printing of a card has one key (`PLAN.md`, "Card and printing").
- Draw batches drop duplicates by this key, `savedIndex()` marks a card saved in any printing, and deck checks count copies by it ([Decks and formats](decks-and-formats.md#counting-copies)).

## Faces and images

- Get images through `selectImages()` (it uses `getFaces()`), never from `image_uris` or `card_faces` directly: a card can have card-level images, one image per face, or both.
- `frontName`, `isBasicLand`, and the type for deck stats (`primaryType()` in `src/stats.js`) come from the front face. A double-faced card shows its front, so a land with a spell on the front looks like a spell, such as [Bala Ged Recovery](https://scryfall.com/search?q=%21%22Bala+Ged+Recovery%22) ([#52](https://github.com/armstrongl/scryfall-app/pull/52)).
- When the card has no `colors`, the snapshot joins the colors of its faces (fixture `card-mdfc`).
- Decide whether to show the text version with `needsTextVersion()`, never a check of your own. It covers `missing` and `placeholder` images and images with no URL.

## Card and printing

- `games`, `set`, `prices`, `purchaseUris`, and `releasedAt` belong to the printing, not the card. Discover searches with `game:arena`, so a paper card often arrives as its Arena-only printing, with `games: ["arena"]` and no prices (fixture `card-arena-printing`, [Abzan Falconer](https://scryfall.com/search?q=%21%22Abzan+Falconer%22) from `j21`).
- To ask whether a card exists in paper, don't trust `games` alone. `inPaper()` in `src/buy.js` also checks Vintage, Legacy, and Commander legality, which belong to the card. A card made only for digital play, fixture `card-digital-only`, is legal in none of the three ([#51](https://github.com/armstrongl/scryfall-app/pull/51)).
- Prices can be null, or foil only. The buy total uses the non-foil `usd` price only, and a card with no `usd` is named as unpriced ([#51](https://github.com/armstrongl/scryfall-app/pull/51)).

## Colors and lands

- Color (`c`) and color identity (`id`) differ. Lands have no color, so `c>=g t:land` finds only double-faced cards with a green spell front. Formats in `IDENTITY_FORMATS` filter by identity, and `autoColorMode()` picks **At most** with identity and **At least** without ([#52](https://github.com/armstrongl/scryfall-app/pull/52)).
- `isBasicTypeLine()` looks for "Basic" before the dash, so snow basics count as basic (fixture `card-snow-basic`). Basics have no copy limit in deck checks.

## Names

- `cardMatchesName()` in `src/deck-import.js` matches the full name or a face name, in any case, without accents or punctuation, and folds Æ to Ae ([#64](https://github.com/armstrongl/scryfall-app/pull/64), [issue #14](https://github.com/armstrongl/scryfall-app/issues/14)). A lookup sends only the first face name of `A // B` (`lookupName()`).

## Queries

- `buildQuery()` in `src/query.js` turns criteria into a Scryfall query. The default gives `f:standard game:arena -is:rebalanced`. Rebalanced cards are Arena-only versions changed for digital play (`PLAN.md`, "Rebalanced card"). Today `is:rebalanced` finds no cards, so `search-rebalanced` is the real 404 (`REPORT.md`, deviation 12). Keep the term in the default.
- **Can be your commander** uses `is:brawler` in Brawl and Standard Brawl, because Brawl allows any legendary planeswalker, and `is:commander` in other formats ([#38](https://github.com/armstrongl/scryfall-app/pull/38)).
- Filter chips name each term in plain words. Raw syntax stays in the **Scryfall search** field. See "Code conventions" in `AGENTS.md`. How Scryfall checks terms against printings is in [Scryfall API](scryfall-api.md).

## Tests

- Use real fixtures only: `fixture(name)` and `snap(name, changes)` from `tests/helpers.js`. Add a new kind of card to `scripts/fetch-fixtures.sh`, and fetch it as [Scryfall API](scryfall-api.md) says. Never hand-write a Card object.
