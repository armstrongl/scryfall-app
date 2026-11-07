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
- Link the sites, apps, formats, mechanics, and cards a page mentions. When in doubt, add the link. Write `[label](https://…)` with the helpers at the top of `src/docs.js`: `link()`, `format()` for a format page on the Wizards of the Coast site, `wiki()` for an MTG Wiki page, `card()` for a card on Scryfall, and `help()` for another help page. Prefer official sources first: Wizards of the Coast, Scryfall, and Commander Spellbook. Only `https://` and `#help/` links work; anything else shows as plain text.
- Add each new Magic term the app uses to the **Glossary** page, with a link.
- After you add or change a link, run `node scripts/check-links.mjs`.

## Tests

- `tests/docs.test.js` checks the pages against the app's real limits, checks their links, the Glossary, and the tooltips, and catches removed features and old names. When you remove or rename something in the app, add the old wording to its list of words that must not appear.
- `tests/agent-docs.test.js` checks that no page uses the first person.
- The tests can't catch everything, so read the pages too.

## README and REPORT

- `README.md` explains what the app does, how to run it, and how to use it.
- `PLAN.md` is the v1 plan. Don't change what it specifies. Record every difference from it in `REPORT.md`, with the reason.
- `REPORT.md` gets a section for each body of work: what changed, the decisions, which tests came first and which came after, and known problems.
