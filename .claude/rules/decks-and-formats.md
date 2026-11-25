---
paths:
  - "src/deck-rules.js"
  - "src/deck-mode.js"
  - "src/deck-import.js"
  - "src/export.js"
  - "src/hand.js"
  - "src/lists.js"
  - "src/stats.js"
  - "src/ui/deck-bar.js"
  - "src/ui/import-panel.js"
---

# Decks and formats

Decks are lists with `kind: "deck"` and a format in `DECK_FORMATS` (`src/config.js`): Standard, Standard Brawl, or Brawl. The format rules are spread over the deck checks, deck mode, deck import, sample hands, and the Arena export in `src/export.js` ([Storage and backups](storage-and-backups.md) owns that file). Most open issues are deck features, so keep these modules in step when you add one.

## Where the rules come from

- Format rules come from the Wizards pages cited at the top of `src/deck-rules.js`: [Standard](https://magic.wizards.com/en/formats/standard) and [Brawl](https://magic.wizards.com/en/formats/brawl). Game rules, such as mulligans, come from the [Comprehensive Rules](https://magic.wizards.com/en/rules), cited by rule number in a code comment.
- Legality comes only from the card snapshot: `standardLegality` and `legalities`. Never write a ban, a rotation date, or a size limit into the code from memory. [Issue #20](https://github.com/armstrongl/scryfall-app/issues/20) needs a link to each announced rotation date, and says so when none is announced.
- Legality is as old as the snapshot. The checks show "Legality as of" the oldest `fetchedAt`, and an old snapshot with no Brawl legality gives the `legalityUnknown` warning, not an error. New legality reaches a deck only through **Refresh card data** ([issue #21](https://github.com/armstrongl/scryfall-app/issues/21)).
- When Wizards hasn't described a rule, don't model a guess. Say so in the help page and track it in an issue, as [issue #54](https://github.com/armstrongl/scryfall-app/issues/54) does for the best-of-one hand shuffler on MTG Arena.

## Counting copies

- A copy is counted by `cardKey()` (the Oracle ID), so every printing of a card counts together.
- Standard counts the main deck and sideboard. Brawl counts the main deck and the commander. **Maybe** never counts, and + to **Maybe** is always allowed.
- The limit is `MAX_COPIES` in Standard and 1 in Brawl. Basic lands have no limit. A card's own text can change it: `copyLimit()` reads "any number of cards named" and "up to seven cards named".
- Brawl sizes are `BRAWL_SIZE`, counting the commander. With a colorless commander, basic lands of one basic land type are allowed.
- `checkDeck()` in `src/deck-rules.js` and `copyRule()` in `src/deck-mode.js` each apply these rules. Change both together, and test both.
- The checks inform and never block an edit. Cards in a section the format doesn't export (a commander in Standard, a sideboard in Brawl) get a warning that says so.

## Arena text

- Text from **Export for Arena** must import back to the same cards and sections. `tests/deck-import.test.js` has the round trip. Change `arenaText()` and `parseDeckText()` together.
- Standard exports main deck lines, then a **Sideboard** block. Brawl exports a **Commander** block, then a **Deck** block, and no sideboard. **Maybe** is never exported. Card lines use the front face name.
- Parsing cases from the [issue #14](https://github.com/armstrongl/scryfall-app/issues/14) review ([PR #64](https://github.com/armstrongl/scryfall-app/pull/64)): a blank line starts the sideboard only when the text has no **Sideboard** header; headers can carry a count, such as "Deck (60)"; a blank line ends a **Commander**, **Companion**, or **About** block; a companion goes to the sideboard once. Names match as "Names" in [Card data](card-data.md#names) says.
- Import never picks the format from the text, because a **Commander** block can be Brawl or Standard Brawl. It never guesses a set code that is neither an `arena_code` nor a Scryfall code: the line is looked up by name.
- The export doesn't write a deck name yet. [Issue #45](https://github.com/armstrongl/scryfall-app/issues/45) has to confirm the **About** and `Name` form first.

## Deck mode

- [Issue #39](https://github.com/armstrongl/scryfall-app/issues/39), [PR #56](https://github.com/armstrongl/scryfall-app/pull/56). The choice lives in the `deckMode` record of the `meta` store. It never syncs and is never in a backup.
- **Hide cards in the deck** applies when cards load and when the switch changes, not after each + or −, so a card stays in place while its count changes. Check only new cards on a draw or **Load more**, or a card added with + can vanish.
- When deck mode stops, when its deck is deleted, and when **Undo** restores a copy, follow "Stale state" in [UI behavior](ui-behavior.md#stale-state). The deck bar sits above the results, as [Design](design.md) says.

## Sample hands

- [Issue #24](https://github.com/armstrongl/scryfall-app/issues/24). The London mulligan (rule 103.5). The first mulligan is free in Brawl and Standard Brawl (rule 103.5c).
- The library is the **Main deck** section only. The commander starts in the command zone, and the sideboard and **Maybe** aren't part of the deck in a game.
- Lands count by the front face, through `primaryType()` in `src/stats.js`, the same as **Deck stats**.

## Tests

- Unit tests go in `tests/deck-rules.test.js`, `tests/deck-mode.test.js`, `tests/deck-import.test.js`, `tests/hand.test.js`, and `tests/lists.test.js`, with real fixtures. Hands take a seeded random function, and the expected odds were computed outside the app.
- The import tests use a stand-in for `/cards/collection` that answers from real fixtures. A test checks it against each recorded response. Add a fixture through `scripts/fetch-fixtures.sh` when a new case needs one. [Issue #59](https://github.com/armstrongl/scryfall-app/issues/59) is to add real text from deck sites.
- Sample hands and deck checks read snapshots only and send no Scryfall requests.
