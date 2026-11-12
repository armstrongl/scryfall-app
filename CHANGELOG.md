# Changelog

The notable changes to Cascade, newest first. The app on [GitHub Pages](https://armstrongl.github.io/scryfall-app/) updates each time a change reaches `main`, so entries go by date, not by version number. Each entry links to its pull request, or to its commit for the early changes that went straight to `main`.

Sections:

- **Added**, **Changed**, **Fixed**, and **Removed** cover what someone using the app sees.
- **Project** covers changes for people and agents who work on the code: tests, scripts, and agent instructions.

## 12 November 2026

### Added

- **Export to GitHub** and **Choose a backup on GitHub**, in **Data**, while sync is connected. A full backup, with history and every setting, goes to a new dated file in the `backups` folder of the sync repository, and any backup there can be imported with **Merge** or **Replace**. ([#36](https://github.com/armstrongl/scryfall-app/pull/36))

- **Sync with GitHub**, in **Data**. Lists, custom presets, and three settings (nerd mode, Draw or Browse, and the Browse sort) sync between devices through one file in a private GitHub repository. Connect with the repository name and a fine-grained token. The app syncs when it opens, when it comes back into view after a minute, a few seconds after a change, and from **Sync now**. **Disconnect** deletes the token from the browser. History and the last search stay on each device. A new **Sync with GitHub** help page explains the setup. ([#32](https://github.com/armstrongl/scryfall-app/pull/32))

### Changed

- Deleting a list or a custom preset now leaves a deletion marker, so that the delete reaches other devices. ([#32](https://github.com/armstrongl/scryfall-app/pull/32))
- While sync is connected, **Replace all data** also replaces the data on GitHub, and so on every connected device. ([#32](https://github.com/armstrongl/scryfall-app/pull/32))
- Backups are schema 3, and schema 1 and 2 backups still import. ([#32](https://github.com/armstrongl/scryfall-app/pull/32))

### Project

- GitHub checks on every pull request: `npm test`, and a changelog entry linked to the pull request. A `no-changelog` label skips the changelog check. ([#34](https://github.com/armstrongl/scryfall-app/pull/34))
- This changelog, with tests that fail when an entry has no link or a merged pull request has no entry. ([#33](https://github.com/armstrongl/scryfall-app/pull/33))

## 7 November 2026

### Added

- **Combos**: an Explore tab, a details link, and **Find combos** for a list, all linking to [Commander Spellbook](https://commanderspellbook.com). A new **Combos** help page explains the bracket tags and combo terms. ([#6](https://github.com/armstrongl/scryfall-app/pull/6))
- **Glossary**, a help page with 35 linked terms. ([#12](https://github.com/armstrongl/scryfall-app/pull/12))
- Tooltips on buttons, **?** buttons on fields, and **Learn more** links from the app to its help pages. ([#12](https://github.com/armstrongl/scryfall-app/pull/12))
- Links in the help pages to Wizards of the Coast, Scryfall, Commander Spellbook, and the MTG Wiki, between the help pages, and on card names. ([#12](https://github.com/armstrongl/scryfall-app/pull/12))
- A **Help** view with seven pages. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))

### Changed

- The app is now called Cascade, with a new icon. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))
- A cleaner look, in the style of GitHub's Primer and Vercel's Geist: neutral grays, the system font, and a blue accent. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))
- Draw takes up to 30 cards, up from 10. Redraws prefer cards that weren't drawn recently for the same search. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))
- Filter chips name an Explore search in plain words, such as "Works with Lotus Cobra". A typed search shows as "Custom search". ([#3](https://github.com/armstrongl/scryfall-app/pull/3))
- The nerd mode tooltip shows on keyboard focus too, and Escape hides it. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))
- The import button "Replace my data" is now **Replace all data**. ([#13](https://github.com/armstrongl/scryfall-app/pull/13))

### Fixed

- The help pages and README match the app again, including **Get started**, the details links, and the filter list. ([#7](https://github.com/armstrongl/scryfall-app/pull/7))

### Removed

- The query display under the results. **Open on Scryfall** stays. ([#3](https://github.com/armstrongl/scryfall-app/pull/3))

### Project

- Agent instructions for every agent, in `AGENTS.md`, `.claude/rules/`, and the shared skills. ([#2](https://github.com/armstrongl/scryfall-app/pull/2), [#13](https://github.com/armstrongl/scryfall-app/pull/13))
- A rule for where raw Scryfall query syntax may appear. ([#8](https://github.com/armstrongl/scryfall-app/pull/8))
- The docs were rewritten in the first person, then made impersonal, with tests that keep them that way. ([#4](https://github.com/armstrongl/scryfall-app/pull/4), [#12](https://github.com/armstrongl/scryfall-app/pull/12), [#13](https://github.com/armstrongl/scryfall-app/pull/13))
- `docs/ui-copy.md`, an index of all interface copy, and `scripts/check-links.mjs`, which checks every help link. ([#12](https://github.com/armstrongl/scryfall-app/pull/12))
- The profile doc is gone. ([#7](https://github.com/armstrongl/scryfall-app/pull/7))

## 5 November 2026

### Added

- **Browse all**: every match for a search, in 11 sort orders, 175 cards at a time. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- **Details** for every card, with a keyword glossary, rulings, legality, prices, and buy links, plus a hover inspector on wide screens. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- **Explore**: synergies, similar cards, and counters, built on [Scryfall Tagger](https://tagger.scryfall.com) tags. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- **Find synergies**: suggested searches for cards that work together. ([ccc393e](https://github.com/armstrongl/scryfall-app/commit/ccc393e))
- **Saved in** markers on cards, **Nerd mode**, filter chips, and an **Arena Brawl** preset. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- Standard Brawl and Brawl deck formats, with Brawl checks, a Commander export block, deck stats, and undo after **Remove**. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- **Open on Scryfall** for a list. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))

### Changed

- The app was renamed Brewmancer, with a new design. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- **Export for Arena** is the main list button. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))
- Backups are schema 2, and schema 1 backups still import. ([#1](https://github.com/armstrongl/scryfall-app/pull/1))

### Project

- Browser tests in `scripts/check-ui.mjs`, and test-driven development as the rule. ([eb1ea17](https://github.com/armstrongl/scryfall-app/commit/eb1ea17))

## 4 November 2026

### Added

- The first version, called Card discovery. It draws random cards that match chosen criteria, from the [Scryfall API](https://scryfall.com/docs/api). ([540be00](https://github.com/armstrongl/scryfall-app/commit/540be00), [d625ac7](https://github.com/armstrongl/scryfall-app/commit/d625ac7), [568fe4b](https://github.com/armstrongl/scryfall-app/commit/568fe4b))
- A criteria builder, pool size, draw history, and presets. ([2e12ee3](https://github.com/armstrongl/scryfall-app/commit/2e12ee3), [0ae23f5](https://github.com/armstrongl/scryfall-app/commit/0ae23f5))
- Lists, and the **Add to list** panel. ([5fb1636](https://github.com/armstrongl/scryfall-app/commit/5fb1636))
- Standard deck checks. ([6b2c674](https://github.com/armstrongl/scryfall-app/commit/6b2c674))
- **Export for Arena**, JSON backup and import, and **Refresh card data**. ([c9bf7d6](https://github.com/armstrongl/scryfall-app/commit/c9bf7d6))

### Project

- The README, `scripts/check-api.mjs`, the build report, and the first agent instructions. ([af6125e](https://github.com/armstrongl/scryfall-app/commit/af6125e), [1886910](https://github.com/armstrongl/scryfall-app/commit/1886910), [04fdb67](https://github.com/armstrongl/scryfall-app/commit/04fdb67))
