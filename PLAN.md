# Implementation plan for the MTG card discovery app

This plan tells a coding agent how to build version 1 (v1) of a web app. The app finds random Magic: The Gathering cards that match criteria the user chooses, and it saves cards to lists that can become decks. The agent works without review between steps. This document is the full specification. If this plan and an official source disagree, follow the official source and record the change in the final report.

## How to work

- Read the full plan before you start.
- Build the milestones in section 7 in order. Do not stop for review between milestones.
- Run the tests before each commit. Make one commit per milestone, or more if a milestone is large.
- Do not add runtime dependencies, a framework, or a build step.
- Do not change repository settings, and do not turn on GitHub Pages. The owner does this. The README tells the owner how.
- If a detail in this plan does not work, choose the most conservative option that keeps all of the rules in section 2, record the decision, and continue.
- Never invent card data, IDs, or API behavior. Get them from real API responses or from the documentation in section 10.
- At the end, write the final report that section 7 describes.

## 1. Goal and scope

The app has one user (the owner) and two main uses:

1. Card discovery: The user sets criteria and draws random cards that match them.
2. Deck building for the Standard format on MTG Arena: The user saves cards to lists, turns a list into a deck, checks the deck against the Standard rules, and exports it as text that MTG Arena can import.

### Terms

- **Magic: The Gathering (MTG)**: A collectible card game from Wizards of the Coast.
- **MTG Arena**: The official digital client for MTG. A player can import a deck into Arena from plain text.
- **Standard**: A constructed format that permits only cards from recent sets. The deck rules are in section 5.4.
- **Scryfall**: A free MTG card search website. Its public REST API is the only data source for this app. See the [Scryfall API documentation](https://scryfall.com/docs/api).
- **Card and printing**: One card (one set of rules text) can have many printings (editions, art, and promo versions). Each printing has its own Scryfall ID (`id`). All printings of one card share an oracle ID (`oracle_id`).
- **Multi-face card**: A card with two or more faces in one Card object, for example a transform card, a modal double-faced card, or a split card. The faces are in the `card_faces` array. See [Card objects](https://scryfall.com/docs/api/cards).
- **Rebalanced card**: An Arena-only version of a card that Wizards changed for digital play. The Scryfall query `is:rebalanced` finds these cards. See the [Scryfall search reference](https://scryfall.com/docs/syntax).
- **Query**: A search string in Scryfall syntax, for example `f:standard game:arena c>=r`.
- **Pool**: All cards that match the current query.

### In scope for v1

- A criteria builder that makes a Scryfall query, with a raw query field for advanced terms.
- Presets, which are saved sets of criteria.
- The pool size for the current query.
- Single draws and batch draws of random cards.
- Card display that follows Scryfall's image rules, including multi-face cards.
- Draw history.
- Lists, with quantity, section, and note for each entry.
- Deck mode with Standard deck checks.
- Text export for MTG Arena.
- A JSON backup that the user can export and import.
- A manual refresh of card data in a list.

### Out of scope for v1

- Accounts and sync across devices. Section 6 describes how a later version adds them.
- Any server or backend.
- Scryfall bulk data files.
- Prices. Arena uses wildcards, not money. The raw query field still accepts price terms.
- Import of the user's Arena collection.
- Deck rules for formats other than Standard.
- Offline mode and service workers.
- Sharing lists with other people.

## 2. Scryfall and Wizards rules

The app must follow all of these rules. If Scryfall's documentation changes, follow the current documentation.

### Requests

- Send every request to `https://api.scryfall.com` over HTTPS. See the [API documentation](https://scryfall.com/docs/api).
- Send an `Accept` header on every API request. Use `Accept: application/json;q=0.9,*/*;q=0.8`. Scryfall rejects or flags requests without it. See [Scryfall's API blog post on required headers](https://scryfall.com/blog/category/api).
- Do not set or change the `User-Agent` header in browser code. Scryfall asks browser JavaScript to keep the browser's own User-Agent.
- When you call the API from a terminal or a test script (not the browser), send a descriptive `User-Agent`, for example `CardDiscoveryDev/0.1`. Do not put an email address in it.

### Rate limits

These are the hard limits from the [Scryfall rate limits page](https://scryfall.com/docs/api/rate-limits):

| Endpoint | Limit |
| --- | --- |
| `/cards/search`, `/cards/named`, `/cards/random`, `/cards/collection` | 2 requests per second (500 ms between requests) |
| All other `api.scryfall.com` methods | 10 requests per second (100 ms between requests) |
| Image files on `*.scryfall.io` | No rate limit |

- An HTTP 429 response restricts access for 30 seconds. The app must not ignore a 429. Section 3.3 describes the required behavior.
- Continued overload can get the user's IP address banned. The request queue in section 3.3 prevents this.

### Caching

- Scryfall asks clients to cache data for at least 24 hours. Gameplay data changes rarely, so a weekly refresh is enough. See the [rate limits page](https://scryfall.com/docs/api/rate-limits).
- The app stores a snapshot of each saved card (section 5.1) and does not fetch saved cards again unless the user selects refresh (section 5.7).

### Data and image use

These rules come from the "Use of Scryfall data and images" part of the [API documentation](https://scryfall.com/docs/api):

- Do not cover, crop, or clip the copyright line or the artist name on card images.
- Do not distort, skew, or stretch card images.
- Do not blur, sharpen, desaturate, or color-shift card images. Do not apply CSS filters to them.
- Do not add watermarks, stamps, or logos to card images.
- Do not use the Scryfall logo. Do not use the Scryfall name in a way that suggests Scryfall endorses the app. The app name must not contain "Scryfall".
- Do not put Scryfall data behind a paywall or a required account.
- The app must add value. It must not only repackage or proxy Scryfall data.

### Wizards of the Coast Fan Content Policy

- The app is fan content. It must show the notice that the [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) requires. Copy the notice text exactly from that page, and replace the title placeholder with the app name.
- The app must be free to use, with no required registration.

### App name

The owner has not chosen a name. Use the working title "Card discovery" in the interface, the page title, and the Fan Content notice. Keep the name in one constant so the owner can change it in one place.

## 3. Architecture

### 3.1 Platform

- The app is a static website: plain HTML, CSS, and JavaScript ES modules. It has no build step, no framework, and no runtime dependencies.
- The owner will host it on [GitHub Pages](https://docs.github.com/en/pages) as a project site. A project site is served from a subpath (`https://<user>.github.io/<repository>/`). Use relative URLs for every local file, so the app works at any path.
- The browser calls the Scryfall API directly. There is no proxy.
- ES modules do not load from `file://` URLs. For local testing, serve the folder with a static server, for example `python3 -m http.server`.
- Tests use the [Node.js built-in test runner](https://nodejs.org/api/test.html) (`node --test`). Node.js 20 or later is necessary. There is no `package.json` dependency list. A `package.json` with only a `test` script and `"type": "module"` is permitted.

### 3.2 File layout

```
index.html
styles.css
manifest.webmanifest
icons/                  App icons for the home screen (original art only)
src/
  main.js               Starts the app and switches between views
  config.js             App name, limits, and other constants
  scryfall.js           API client and request queue (network)
  query.js              Criteria to query string (pure)
  cards.js              Card helpers: faces, images, snapshots (pure)
  lists.js              List and entry operations (pure)
  deck-rules.js         Standard deck checks (pure)
  export.js             Arena text, JSON backup, import checks (pure)
  storage/
    index.js            The storage interface that the rest of the app uses
    indexeddb.js        The IndexedDB implementation of the interface
  ui/                   One module for each view or shared component
tests/
  fixtures/             Real API responses, saved as JSON
  *.test.js
README.md
PLAN.md                 This file
```

A pure module has no DOM access, no network access, and no storage access. It takes data in and returns data. Node tests import the pure modules directly.

### 3.3 Request queue

All calls to `api.scryfall.com` go through one queue in `src/scryfall.js`. No other module calls `fetch` for the API.

- The queue sends one request at a time.
- The queue waits at least 500 ms between the start of one request and the start of the next. This value obeys the strictest limit in section 2, so one rule covers all endpoints.
- If a response has status 429, the queue pauses all requests for 30 seconds. Then it sends the same request one more time. If that request also gets a 429, the queue rejects it and does not retry again.
- During a pause, the interface shows the time that is left.
- A caller can cancel the requests that it put in the queue. A batch draw uses this when the user selects cancel.
- Image requests to `*.scryfall.io` do not go through the queue. The browser loads them with `<img>` elements.

### 3.4 Error handling

Map API results to these states. The interface text in this table is the required meaning. You can change the words, but keep the meaning and the fix.

| Result | Meaning | Interface text (example) |
| --- | --- | --- |
| 404 with `code` set to `not_found` from `/cards/search` or `/cards/random` | No cards match the query. | "No cards match these criteria. Remove a filter and try again." |
| Other 4XX (not 429) with an Error object | Scryfall cannot use the query or the request. | Show the Error object's `details` text, plus each string in `warnings`. |
| 429 after the retry | Scryfall paused requests. | "Scryfall paused requests. Wait 30 seconds, then try again." |
| 5XX | Scryfall has a problem. | "Scryfall is not available. Try again later." |
| Network failure | The app cannot reach Scryfall. | "Can't connect to Scryfall. Check your connection and try again." |

- The Error object has the fields `status`, `code`, `details`, and optional `type` and `warnings`. See [Error objects](https://scryfall.com/docs/api/errors).
- A successful List object can also have `warnings`. Show them near the query preview, because they mean that Scryfall ignored part of the query. See [List objects](https://scryfall.com/docs/api/lists).
- Two real 404 responses for the query `asdf` are recorded in the [scryr test fixtures](https://rdrr.io/cran/scryr/src/tests/testthat/api.scryfall.com/cards/random-4d66c8.R). Confirm the behavior with your own requests (section 9).

## 4. Features

Each feature has acceptance criteria. A feature is done when all of its criteria are true.

### 4.1 Criteria builder

The criteria builder is a form. `src/query.js` turns its values into one query string. The `Criteria` object is in section 5.1.

| Control | Values | Query output |
| --- | --- | --- |
| Format | A legality key, or "Any format". Default: `standard`. | `f:standard` |
| Game | Arena, MTGO, Paper, or Any. Default: Arena. | `game:arena`, `game:mtgo`, `game:paper` |
| Exclude rebalanced cards | On or off. Default: on. | `-is:rebalanced` |
| Color mode | Any, Exactly, At least, At most. Default: Any. | Sets the operator: `=`, `>=`, `<=` |
| Colors | Any of W, U, B, R, G | `c=wu`, `c>=wu`, `c<=wu` |
| Colorless | On or off. When on, the color checkboxes are not available. | `c=c` |
| Card types | Any of artifact, battle, creature, enchantment, instant, land, planeswalker, sorcery | One type: `t:creature`. More than one: `(t:creature or t:instant)` |
| Type line text | Free text, for example a subtype | `t:goblin`, or `t:"word word"` if the text has a space |
| Mana value | Minimum and maximum whole numbers, each optional | `mv>=2 mv<=4`. If both are equal: `mv=3` |
| Rarity | Any of common, uncommon, rare, mythic | One: `r:rare`. More than one: `(r:rare or r:mythic)` |
| Keyword ability | Free text | `kw:flying`, or `kw:"first strike"` |
| Rules text | Free text | `o:"draw a card"` |
| Raw query | Any Scryfall syntax | `(<raw query>)` |

Rules for the query builder:

- Get the list of format keys from the `legalities` object of a real Card object. Do not write the list from memory. Show readable names (for example "Standard") next to each key.
- Join the non-empty parts with one space, in the order of the table. A fixed order makes the output predictable for tests and for caching.
- Wrap the raw query in parentheses. Without them, a top-level `or` in the raw query changes the meaning of the full query.
- If free text contains a double quote character, do not build a term from it. Show a hint that tells the user to use the raw query field.
- Scryfall rejects a `q` value longer than 1000 Unicode characters. See [GET /cards/search](https://scryfall.com/docs/api/cards/search). Show an error and do not send the request if the query is longer.
- The default criteria give the query `f:standard game:arena -is:rebalanced`.

Acceptance criteria:

- The query preview shows the full query and changes as the user edits the form.
- The preview has a "Copy query" button and an "Open on Scryfall" link to `https://scryfall.com/search?q=<encoded query>`.
- Unit tests cover every row of the table, the empty form, the default criteria, the parentheses rules, and the length limit.

### 4.2 Presets

- The app has one built-in preset, "Arena Standard", with the default criteria. The user cannot delete it.
- The user can save the current criteria as a named preset, apply a preset, rename a preset, and delete a custom preset.
- Deletion uses a confirmation inside the page. Browser dialogs (`alert`, `confirm`, `prompt`) are not permitted.
- The app restores the last used criteria when it starts.

Acceptance criteria:

- Presets and the last used criteria stay after a page reload.
- Applying a preset sets every control and the query preview.

### 4.3 Pool size

- When the criteria stop changing for 800 ms, the app calls `GET /cards/search?q=<query>&unique=cards` and shows `total_cards` from the List object, for example "1,234 cards match". The `unique=cards` value counts each card once, not each printing.
- A 404 with `not_found` shows "0 cards match".
- Keep the result in memory for the session, keyed by the query string, so the same query does not cause a second request.
- Never show a count for a query that is different from the current query.

Acceptance criteria:

- Fast typing causes at most one pool-size request after the user stops.
- The count and any warnings match the current query.

### 4.4 Draw

- The user chooses a count from 1 to 10. The default is 1.
- For each card, the app calls `GET /cards/random?q=<query>` through the queue. See [GET /cards/random](https://scryfall.com/docs/api/cards/random).
- A batch removes duplicates. Two results are duplicates when they have the same oracle ID (section 5.1 defines the key). The app makes at most 3 × the count attempts, then stops.
- If the pool size is known and is smaller than the count, the app reduces the count to the pool size and tells the user.
- If a batch stops early, the app tells the user how many unique cards it found.
- A batch shows its progress, for example "Drawing 3 of 10", and has a cancel button.
- New results replace the old results on the screen. Each drawn card also goes to the history (section 4.6).
- Section 9 has a check for how Scryfall weights random results. If that check shows that results are weighted by printing, change the draw method as section 9 describes.

Acceptance criteria:

- A batch of 10 never sends requests faster than the queue permits.
- A batch has no duplicate cards.
- Cancel stops all requests of that batch that have not started.

### 4.5 Card display

- Image source: If the Card object has `image_uris`, use it. If not, use `image_uris` on each item in `card_faces`. See [Card objects](https://scryfall.com/docs/api/cards).
- If a card has two face images, show a "Show other face" button. Do not combine or overlap the two images.
- Use the `normal` size (488 × 680) in draw results and the `small` size (146 × 204) in list rows. See [Card imagery](https://scryfall.com/docs/api/images).
- Keep the aspect ratio of the image. Reserve the space with the same aspect ratio before the image loads, so the layout does not move.
- Put all controls outside the image. Nothing can overlap any part of the image, because the artist name and copyright line are at the bottom.
- If `image_status` shows that the image is missing or is a placeholder, or if the image fails to load, show a text version of the card: name, mana cost, type line, and rules text.
- Use the card name and type line as the image `alt` text.
- Below the image, show the name, the type line, the set name, and the rarity. Show a "View on Scryfall" link to `scryfall_uri` and an "Add to list" button.
- Load images with `loading="lazy"` in long lists.

Acceptance criteria:

- A normal card, a transform card, a modal double-faced card, and a split card all show the correct images. Use fixtures (section 8) to test the image selection in `src/cards.js`.
- No CSS filter, crop, or overlay touches a card image.

### 4.6 History

- The history keeps the last 100 drawn cards, newest first. Each item shows the card, the time of the draw, and the query.
- The user can add a card to a list from the history.
- The user can clear the history after a confirmation inside the page.

Acceptance criteria:

- The history stays after a page reload.
- Item 101 removes the oldest item.

### 4.7 Interface and accessibility

- Design for phones first (360 to 400 px wide), then for desktop. The page must never scroll sideways.
- The app has three views: Discover (criteria, pool size, draw, results, history), Lists (list index and list detail), and Data (backup, import, storage status, attribution).
- Support light and dark themes with `prefers-color-scheme`.
- Every control has a visible label. Keyboard focus is always visible. Touch targets are at least 44 × 44 CSS px.
- Announce draw results, errors, and pause timers with an `aria-live` region.
- Respect `prefers-reduced-motion`.
- Interface text: use sentence case, plain words, and active voice. Do not use em dashes. Error messages say what happened and how to fix it. Do not write "Oops" or apologies.
- The footer on every view shows "Card data and images from Scryfall" (with a link to `https://scryfall.com`) and the Fan Content notice from section 2.
- Use only original icons and art. Do not use Scryfall or Wizards logos, mana symbol artwork, or card art in the app icons.

## 5. Lists and decks

### 5.1 Data model

This notation is for documentation. Write the code in plain JavaScript and describe these shapes with JSDoc comments. All dates are ISO 8601 strings in UTC. All IDs that the app makes come from `crypto.randomUUID()`.

```ts
type CardSnapshot = {
  scryfallId: string;        // Card.id
  oracleId: string | null;   // Card.oracle_id, or card_faces[0].oracle_id if the card has none
  name: string;              // Card.name (multi-face names use " // ")
  frontName: string;         // card_faces[0].name for multi-face cards, otherwise Card.name
  arenaId: number | null;    // Card.arena_id
  set: string;               // Card.set
  setName: string;           // Card.set_name
  collectorNumber: string;   // Card.collector_number (a string, not a number)
  rarity: string;            // Card.rarity
  manaCost: string;          // Card.mana_cost, or the front face's mana_cost
  manaValue: number;         // Card.cmc
  typeLine: string;          // Card.type_line, or the front face's type_line
  colors: string[];          // Card.colors, or the union of the faces' colors
  colorIdentity: string[];   // Card.color_identity
  isBasicLand: boolean;      // See section 5.4
  standardLegality: string;  // Card.legalities.standard
  images: { small: string | null; normal: string | null }[]; // One item for each face that has an image
  scryfallUri: string;       // Card.scryfall_uri
  fetchedAt: string;         // When the app got this data
};

type Entry = {
  id: string;
  card: CardSnapshot;
  quantity: number;          // A whole number, 1 or more
  section: "main" | "sideboard" | "maybe";
  note: string;              // Can be empty
  addedAt: string;
};

type CardList = {
  id: string;
  name: string;
  kind: "collection" | "deck";
  format: "standard";        // Used only when kind is "deck"
  entries: Entry[];
  createdAt: string;
  updatedAt: string;
};

type Criteria = {
  format: string | null;     // A legality key, or null for any format
  game: "arena" | "mtgo" | "paper" | null;
  excludeRebalanced: boolean;
  colorMode: "any" | "exactly" | "atLeast" | "atMost";
  colors: ("w" | "u" | "b" | "r" | "g")[];
  colorless: boolean;
  types: string[];
  typeText: string;
  mvMin: number | null;
  mvMax: number | null;
  rarities: ("common" | "uncommon" | "rare" | "mythic")[];
  keyword: string;
  oracleText: string;
  rawQuery: string;
};

type Preset = {
  id: string;
  name: string;
  builtIn: boolean;
  criteria: Criteria;
  createdAt: string;
  updatedAt: string;
};

type HistoryItem = {
  id: string;
  card: CardSnapshot;
  query: string;
  drawnAt: string;
};

type Settings = {
  lastCriteria: Criteria;
  lastUsedListId: string | null;
  lastBackupAt: string | null;
  lastChangeAt: string | null; // The last time a list or preset changed
};
```

The card key is `oracleId` if it is not null, otherwise `name`. The app uses this key to find duplicates (section 4.4) and to count copies (section 5.4).

### 5.2 List operations

- The user can create, rename, and delete lists. Deletion uses a confirmation inside the page.
- The user can change the kind of a list between "collection" and "deck" at any time. The change keeps all entries.
- The user can change the quantity, section, and note of an entry, and can remove an entry.
- If the user adds a card that is already in the same section of the list (same Scryfall ID), the app adds to the quantity of that entry. It does not make a second entry.
- The list detail view can sort entries by name, mana value, or type, and groups them by section. Each section shows its total quantity.

Acceptance criteria:

- Unit tests in `tests/lists.test.js` cover add, merge, change, remove, and kind changes.
- Lists stay after a page reload.

### 5.3 Add to list

- "Add to list" opens a panel. The panel shows all lists with a checkbox for each, so the user can add one card to more than one list in one step.
- The panel has a quantity (default 1), a section (default "main"), and a "New list" field.
- The app selects the last used list by default.

Acceptance criteria:

- The user can add one drawn card to two lists and create a third list without leaving the Discover view.

### 5.4 Standard deck checks

The checks run only when the list kind is "deck". They give information and never block an edit. The rules come from the [Wizards Play Network formats page](https://wpn.wizards.com/en/formats):

| Check | Rule | Result if the rule is broken |
| --- | --- | --- |
| Main deck size | At least 60 cards in "main" | Warning, with the number of cards still needed |
| Sideboard size | At most 15 cards in "sideboard" | Error |
| Copies | At most 4 copies of a card, counted across "main" and "sideboard" by the card key | Error that names the card |
| Basic lands | Basic lands have no copy limit | No result |
| Legality | `standardLegality` is `legal` for every card in "main" and "sideboard" | Error that names the card and its status |

- Cards in "maybe" do not count for any check.
- A card is a basic land when the part of its front face type line before the subtype separator (the character U+2014) contains the word "Basic".
- Legality uses the snapshot. Show "Legality as of <date>" with the oldest `fetchedAt` in the deck, and a link to refresh (section 5.7). Standard sets change over time, and bans can happen, so an old snapshot can be wrong.

Acceptance criteria:

- `src/deck-rules.js` is pure, and `tests/deck-rules.test.js` covers each row of the table, the "maybe" section, and a basic land with more than 4 copies.

### 5.5 Arena text export

The [MTG Arena import help page](https://mtgarena-support.wizards.com/hc/en-us/articles/360049857771-Importing-a-Deck) shows a deck as one line per card: the quantity, a space, then the card name. Use this format:

```
4 <front name>
2 <front name>

Sideboard
1 <front name>
```

- The main deck lines come first, with no header.
- If the sideboard has entries, add one empty line, the line `Sideboard`, then the sideboard lines.
- Do not export the "maybe" section.
- Use `frontName` for each card. Section 9 has a check for multi-face names.
- The export view shows the text in a read-only text area with a "Copy" button. Call `navigator.clipboard.writeText` in the click handler. If it fails, select all of the text so the user can copy it by hand.
- The Arena help page does not document the `Sideboard` header. The owner must test it in Arena (section 9).

Acceptance criteria:

- `tests/export.test.js` checks the exact output for a deck with main, sideboard, and maybe entries.

### 5.6 JSON backup and import

The backup file has this shape:

```ts
type Backup = {
  app: "card-discovery";
  schemaVersion: 1;
  exportedAt: string;
  lists: CardList[];
  presets: Preset[];   // Custom presets only
  history: HistoryItem[];
  settings: Settings;
};
```

- "Export backup" downloads a file named `card-discovery-backup-<YYYY-MM-DD>.json` and sets `lastBackupAt`.
- "Import backup" reads a file that the user selects. The app checks `app` and `schemaVersion`, then shows how many lists, presets, and history items the file has.
- The user then chooses "Merge" or "Replace", and confirms inside the page.
  - Merge: Items with a new ID are added. For an ID that already exists, the item with the later `updatedAt` stays. History items with an existing ID are skipped. The current settings stay.
  - Replace: All current data is removed, then the file's data is added, including its settings.
- If the file is not valid, the app shows what is wrong and changes no data.
- When `lastChangeAt` is later than `lastBackupAt` and `lastBackupAt` is more than 14 days old (or null), the Data view and the Lists view show a reminder to export a backup.

Acceptance criteria:

- `tests/export.test.js` checks that export followed by import (Replace) gives the same data, that Merge follows the `updatedAt` rule, and that a file with a wrong `schemaVersion` is rejected.

### 5.7 Refresh card data

- "Refresh card data" in a list sends the list's Scryfall IDs to `POST /cards/collection` through the queue. Send at most 75 identifiers in each request, as `{"identifiers": [{"id": "<scryfall id>"}]}`. See [POST /cards/collection](https://scryfall.com/docs/api/cards/collection).
- Replace each snapshot with new data, but keep the entry's quantity, section, and note.
- The response lists unknown identifiers in `not_found`. Show those cards as "Not found on Scryfall" and keep their old snapshots.
- Refresh runs only when the user selects it.

Acceptance criteria:

- A list of 100 cards uses 2 requests, and the queue spaces them.

### 5.8 Storage durability

- Store all data in IndexedDB through `src/storage/indexeddb.js`. See [IndexedDB on MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
- After the first save, call [`navigator.storage.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist). Show the result in the Data view ("Storage: persistent" or "Storage: the browser can clear it").
- Safari deletes all script-writable storage (including IndexedDB and localStorage) for a site after 7 days of Safari use without a visit to that site. Web apps that the user adds to the home screen have their own counter that resets on each use. See [WebKit's post on the 7-day cap](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).
- Because of this rule, include a [web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest) and icons, and tell iPhone users in the Data view to add the app to the home screen.
- Wrap all storage calls in error handling. If storage is not available (for example, in a private window), the app still works for discovery, and it shows that lists cannot be saved.

## 6. Phase 2 sync (not in v1)

Do not build sync in v1. Build v1 so that a later version can add sync without a rewrite.

- All code outside `src/storage/` uses only this interface from `src/storage/index.js`. Every method returns a Promise.

```ts
interface Storage {
  getLists(): Promise<CardList[]>;
  getList(id: string): Promise<CardList | null>;
  saveList(list: CardList): Promise<void>;      // Create or replace, and set updatedAt
  deleteList(id: string): Promise<void>;
  getPresets(): Promise<Preset[]>;
  savePreset(preset: Preset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  getHistory(): Promise<HistoryItem[]>;
  addHistory(item: HistoryItem): Promise<void>; // Keeps the newest 100
  clearHistory(): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  exportAll(): Promise<Backup>;
  importAll(backup: Backup, mode: "merge" | "replace"): Promise<void>;
}
```

- Every record has a UUID and an `updatedAt` date, so a sync service can merge records.
- v1 deletes records permanently. A sync version must add deletion markers, so that a delete on one device reaches other devices.
- The owner will choose a sync option later. Two candidates are a hosted database with built-in sign-in (for example [Supabase](https://supabase.com)), or a small server on an always-on machine that only the owner's devices can reach through a private network.

## 7. Build order

Build the milestones in this order. Each milestone is done when its "Done when" items are true.

1. **Project skeleton**: Make the files from section 3.2, `config.js`, the three empty views with navigation, the footer from section 4.7, the manifest, the icons, and the test setup.
   Done when: The page loads from a local static server and from a subpath (for example `http://localhost:8000/sub/`), and `node --test` runs and passes.
2. **Scryfall client**: Build the queue from section 3.3 and the error mapping from section 3.4.
   Done when: Unit tests with a fake clock prove the 500 ms spacing, the 30-second pause after a 429, the single retry, and cancel. One random card loads in the browser.
3. **Storage**: Build the interface from section 6 and the IndexedDB implementation, with version upgrades through `onupgradeneeded`.
   Done when: Data stays after a reload, and the app still works when storage throws an error.
4. **Criteria and presets**: Build sections 4.1 and 4.2.
   Done when: The acceptance criteria of 4.1 and 4.2 are true.
5. **Pool size, draw, display, and history**: Build sections 4.3 to 4.6.
   Done when: The acceptance criteria of 4.3 to 4.6 are true.
6. **Lists**: Build sections 5.2 and 5.3.
   Done when: The acceptance criteria of 5.2 and 5.3 are true.
7. **Deck checks**: Build section 5.4.
   Done when: The acceptance criteria of 5.4 are true.
8. **Export, backup, and refresh**: Build sections 5.5 to 5.8.
   Done when: The acceptance criteria of 5.5 to 5.7 are true, and the Data view shows the storage status.
9. **Checks, polish, and report**: Do the checks in section 9. Do the manual tests in section 8. Fix what fails. Write the README and the final report.
   Done when: All tests pass, every check in section 9 has a recorded result, and the final report is done.

### README

The README tells the owner:

- What the app does, in two or three sentences.
- How to run it locally.
- How to run the tests.
- How to turn on GitHub Pages for the repository (link to [the GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages)).
- How to add the app to the home screen on iPhone, and why (section 5.8).
- How to change the app name.

### Final report

Put the final report in the pull request description, or in `REPORT.md` if there is no pull request. It has:

- What was built, by milestone.
- The test results.
- The result of each check in section 9.
- Each change from this plan, with the reason.
- Known problems.
- Tasks for the owner: turn on GitHub Pages, test the Arena import (section 9), and choose an app name.

## 8. Testing

### Unit tests

Write tests with `node:test` and `node:assert` for each pure module:

- `query.js`: every control, the default criteria, combinations, parentheses, quotes, and the length limit.
- `cards.js`: image selection, snapshots, the card key, and basic land detection, for each fixture.
- `lists.js`: section 5.2.
- `deck-rules.js`: section 5.4.
- `export.js`: sections 5.5 and 5.6.
- `scryfall.js`: the queue, with a fake clock and a fake `fetch`.

### Fixtures

- Save real API responses in `tests/fixtures/`. Get them with a terminal tool that obeys section 2 (headers and 500 ms spacing).
- Get at least: a normal card, a transform card, a modal double-faced card, a split card, a basic land, a rebalanced card, a 404 response from `/cards/random`, a List object from `/cards/search`, and a response from `/cards/collection` that has a `not_found` item. Use the [search reference](https://scryfall.com/docs/syntax) to find each kind of card.
- If you cannot reach the API, write fixtures by hand only for the shape of the data. Put "synthetic" in each file name, and say so in the final report. Never present synthetic data as real data.

### Manual tests

Do these tests in a desktop browser and in a phone-width browser window (about 390 px), in light and dark themes:

1. Draw 1 card and 10 cards with the default preset.
2. Draw with a query that matches no cards, and with a query that is not valid.
3. Show both faces of a double-faced card.
4. Add one card to two lists, then create a new list from the add panel.
5. Make a deck with more than 4 copies of a card, more than 15 sideboard cards, and fewer than 60 main cards. Confirm each check result.
6. Export the deck as Arena text and copy it.
7. Export a backup, clear the site data, import the backup with Replace, and confirm that all data is back.
8. Refresh a list.
9. Use the full app with only a keyboard.

## 9. Items to verify

Do each check, record the result in the final report, and follow the decision rule.

| Item | How to check | Decision rule |
| --- | --- | --- |
| CORS for browser calls | Run `curl -sI -A "CardDiscoveryDev/0.1" -H "Accept: application/json" -H "Origin: https://example.github.io" "https://api.scryfall.com/cards/random"` and look for an `access-control-allow-origin` header. Also confirm a real call from a page on `localhost`. | If browser calls fail, stop the browser work and report the problem. Do not add a proxy. |
| Random weighting | Find a small query that matches two cards: one with many Arena printings and one with one printing. Draw 40 times. Compare how often each card appears. | If the card with many printings appears much more often, the pool is weighted by printing. Then change the draw to use `/cards/search` with `unique=cards` and a fixed sort (for example `order=name`): get `total_cards` from page 1, choose a random index, request the page that holds that index (175 cards per page), and take that card. Cache each page for the current query. |
| Arena printings | For 20 draws with `game:arena`, confirm that each card's `games` array contains `arena`. | If not, record the result and show a note in the interface. |
| Rebalanced cards | Compare `total_cards` for `f:standard game:arena` and `f:standard game:arena -is:rebalanced`. Confirm that no result name starts with `A-`. | Keep `-is:rebalanced` in the default in all cases. Record whether it changes the count. |
| Query syntax | For each row in the table in section 4.1, run one real search and confirm that the List object has no `warnings`. | Fix any term that causes a warning. Record each fix. |
| Error responses | Send a query that is not valid (for example `mv>abc`). Record the status, `code`, `details`, and `warnings`. | Update the error mapping in section 3.4 if needed. |
| Arena import (owner task) | The owner pastes an export with a sideboard, a transform card, a modal double-faced card, and a split card into Arena. | The agent cannot test this. List it as an owner task. |
| Names that differ on Arena (owner task) | Look in Card objects for name fields other than `name` (for example a printed or flavor name). Record what you find. | Record the result. The owner confirms in Arena whether the export names work. |

## 10. References

Scryfall:

- [API documentation](https://scryfall.com/docs/api)
- [Rate limits](https://scryfall.com/docs/api/rate-limits)
- [Required headers (API blog)](https://scryfall.com/blog/category/api)
- [Help for blocked access](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- [Error objects](https://scryfall.com/docs/api/errors)
- [List objects](https://scryfall.com/docs/api/lists)
- [Card objects](https://scryfall.com/docs/api/cards)
- [Card imagery](https://scryfall.com/docs/api/images)
- [GET /cards/random](https://scryfall.com/docs/api/cards/random)
- [GET /cards/search](https://scryfall.com/docs/api/cards/search)
- [POST /cards/collection](https://scryfall.com/docs/api/cards/collection)
- [Search reference (query syntax)](https://scryfall.com/docs/syntax)

Wizards of the Coast:

- [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
- [Wizards Play Network formats (Standard deck rules)](https://wpn.wizards.com/en/formats)
- [MTG Arena: importing a deck](https://mtgarena-support.wizards.com/hc/en-us/articles/360049857771-Importing-a-Deck)

Web platform and tools:

- [IndexedDB API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [StorageManager.persist() (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [Web app manifest (MDN)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)
- [Full third-party cookie blocking and more (WebKit blog, 7-day storage cap)](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Node.js test runner](https://nodejs.org/api/test.html)
- [GitHub Pages documentation](https://docs.github.com/en/pages)

Community sources (weaker evidence, used only where no primary source covers the detail):

- [scryr test fixture: 404 from /cards/random](https://rdrr.io/cran/scryr/src/tests/testthat/api.scryfall.com/cards/random-4d66c8.R)
- [scryr test fixture: 404 from /cards/search](https://rdrr.io/github/curso-r/scryr/src/tests/testthat/api.scryfall.com/cards/search-524d7c.R)