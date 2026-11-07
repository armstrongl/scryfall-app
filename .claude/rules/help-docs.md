---
paths:
  - "src/docs.js"
  - "README.md"
  - "REPORT.md"
---

# Help docs

The app has help pages built in (`DOC_PAGES` in `src/docs.js`, shown in the **Help** view). After every change, check whether they, `README.md`, and `REPORT.md` need an update, and update them in the same change.

## Writing the pages

- Address the reader as "you". Never use the first person, and never use the third person for the person the app is built for. [GitHub voice](github-voice.md) has the full rule.
- Put UI labels in bold with `**Label**`. `inlineParts()` turns them into bold text, with no HTML.
- Use `APP_NAME`, never the app name written out.
- Use the app's real limits from `src/config.js`, such as `MIN_DRAW` and `MAX_DRAW`.
- The nerd mode page repeats `NERD_MODE_TIP` word for word, so that the tooltip and the page never disagree.
- Link to the source for anything that comes from another site: [Scryfall](https://scryfall.com), [Scryfall Tagger](https://tagger.scryfall.com), [Commander Spellbook](https://commanderspellbook.com), [EDHREC](https://edhrec.com), and the [MTG Wiki](https://mtg.wiki).

## Tests

- `tests/docs.test.js` checks the pages against the app's real limits and catches removed features and old names. When you remove or rename something in the app, add the old wording to its list of words that must not appear.
- `tests/agent-docs.test.js` checks that no page uses the first person.
- The tests can't catch everything, so read the pages too.

## README and REPORT

- `README.md` explains what the app does, how to run it, and how to use it.
- `PLAN.md` is the v1 plan. Don't change what it specifies. Record every difference from it in `REPORT.md`, with the reason.
- `REPORT.md` gets a section for each body of work: what changed, the decisions, which tests came first and which came after, and known problems.
