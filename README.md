# Cascade

Cascade helps you discover Magic: The Gathering cards, learn what they do, and see how they work together. You can draw random cards or browse every card that matches your filters. You can find synergies, similar cards, and counters for any card, find combos on [Commander Spellbook](https://commanderspellbook.com), save cards to lists, check Standard and Brawl decks, and export decks for MTG Arena. The app runs in your browser and gets card data and images from the [Scryfall API](https://scryfall.com/docs/api). It has no server and no accounts.

Cascade is a personal app first. It's tuned for Standard and [Brawl](https://magic.wizards.com/en/formats/brawl) on [MTG Arena](https://magic.wizards.com/en/mtgarena), and for discovering cards and how they interact.

## Run the app locally

The app is a static site with no build step. Browsers don't load ES modules from `file://` URLs, so you need a local static server.

1. Open a terminal in the repository folder.
2. Start a server:

   ```sh
   python3 -m http.server 8000
   ```

3. Open <http://localhost:8000/> in your browser.

The app uses relative URLs, so it also works from a subpath, for example `http://localhost:8000/some/folder/`.

## Use the app

The app has four views: **Discover**, **Lists**, **Data**, and **Help**. On a phone, they're in the row of tabs under the app name. **Help** has short pages on every feature, built into the app, with links to the sites, formats, and terms they mention, and a **Glossary** of Magic terms. Point at a button, or move the keyboard focus to it, to see a tooltip that says what it does. To see what a filter or setting means, select **?** next to it. **Learn more** links open the help page for that part of the app.

Turn on **Nerd mode** at the top of the page to see more on every card: mana value, power and toughness, set and rarity, release date, price, EDHREC rank, and legality in Standard and Brawl. Cards get smaller, so more fit on the screen. To see what nerd mode does, point at the switch or move the keyboard focus to it.

### Find cards

1. Open **Discover**.
2. Choose a preset, or select **Filters** to choose format, game, colors, card types, type line text, mana value, rarity, keywords, rules text, or Scryfall search syntax (**Scryfall search**). Each active filter shows as a chip in plain words. Scryfall search syntax that you type shows as **Custom search**, and a search from Explore says where it came from, for example "Works with Lotus Cobra". To remove a filter, select **×** on its chip. The app shows how many cards match. To see the same search on the Scryfall website, select **Open on Scryfall**.
3. Choose how to see cards:
   - **Draw random** draws 1 to 30 random cards. When you draw again with the same filters, the app prefers cards you haven't drawn recently for that search. If there aren't enough new cards, it fills the draw with recent ones and says how many. If 175 cards or fewer match, the app gets them all in one request and draws from them. Otherwise it asks Scryfall for one random card at a time, at most two a second.
   - **Browse all** lists every match, in the order you choose: name, mana value, release date, rarity, color, set, popularity (EDHREC rank), price, power, toughness, or artist. Select **Show cards**. The app loads 175 cards at a time. Select **Load more** for the next 175.

The built-in presets are **Arena Standard** (cards legal in Standard on MTG Arena) and **Arena Brawl** (cards legal in Brawl on MTG Arena, with colors read as color identity). To keep your own filters, select **Save as preset**. Your recent draws are under **Recent draws**.

A card you already saved shows **Saved in** and the name of the list.

### See everything about a card

Select **Details** on a card. The details show:

- The rules text.
- Explanations of the card's keywords, with links to the MTG Wiki.
- The card's official rulings. Select **Show rulings** to load them.
- Legality in the Arena formats.
- The printing, prices, and links to buy the card.
- Links to Scryfall, EDHREC, Gatherer, and the card's combos on Commander Spellbook.

On a wide screen, point at a card or move the keyboard focus to it to see the same details in the panel beside the cards.

### Find synergies, similar cards, counters, and combos

1. Select **Explore** on any card, in Discover or in a list.
2. Choose a tab:
   - **Synergies**: cards that work with this one, such as "Green cards that leverage landfall" or "White cards that benefit from enchantments". They stay in the card's colors.
   - **Similar**: cards that do the same job for a similar cost, share its keywords, or share its type and cost.
   - **Counters**: cards that answer this one, such as creature removal or cards that punish fliers. They're in every color.
   - **Combos**: links to combos with this card on Commander Spellbook, legal in the format of your current search, or in Commander when the search has no format. A legendary creature or planeswalker also gets a link to combos in its colors.
3. Select **Search**. Discover opens with that search in Browse mode, most popular first. It keeps your format and game and leaves out the card itself. Its filter chip names the search, for example "Works with Lotus Cobra: Green cards that leverage landfall".

The searches use [Scryfall Tagger](https://tagger.scryfall.com/) tags, which the community maintains, together with keywords and rules text. Check the results before you build around them.

On the **Combos** tab, select **Open** instead of **Search**. Commander Spellbook opens in a new tab. Formats it doesn't track, such as Historic, show combos legal in Commander.

### Find combos in a list

[Commander Spellbook](https://commanderspellbook.com) is a separate combo database. Its API only accepts browser requests from its own site, so the app links to it and shows none of its data.

1. Open a list in **Lists**, then select **Find combos**.
2. Select **Copy**, then **Open Find My Combos**.
3. Paste the list into the decklist box on their site, then select **Find New Combos**.

Find My Combos shows the combos in the list and the combos it's one card away from. The copied text leaves out the **Maybe** section and puts a Brawl deck's commander after a `// Commanders` line. A Brawl deck with a commander also gets links to combos with the commander and to combos in its colors. The **Combos** help page explains bracket tags, such as Spicy, and combo terms.

### Save cards to a list

1. On a card, select **Add**.
2. Choose one or more lists, or make a new one. Set the quantity and the section: **Main deck**, **Sideboard**, **Maybe**, or **Commander**.
3. Select **Add**.

A list is a **Collection** or a **Deck**. A deck has a format: **Standard**, **Standard Brawl**, or **Brawl**. You can change the kind and the format at any time in the **Lists** view, and the cards stay.

If you remove a card from a list, select **Undo** in the message that appears to put it back.

### Build and export a deck

1. Open **Lists**, then open a list with the kind **Deck**.
2. Choose its **Format**.
3. Read the deck checks:
   - **Standard:** a main deck under 60 cards, a sideboard over 15 cards, more than 4 copies of a card, and cards that aren't legal.
   - **Brawl (100 cards) and Standard Brawl (60 cards):** the commander, the deck size, one copy of each card except basic lands, the commander's color identity, and legality.

   Legality comes from the card data saved with the list. To get current data, select **More**, then **Refresh card data**.
4. Check **Deck stats** for the mana curve, the colored mana symbols, and the card types.
5. Select **Export for Arena**, then select **Copy**. For a Brawl deck, the text has a Commander block and a Deck block.
6. In MTG Arena, open **Decks**, then select **Import**.

To see a whole list on Scryfall, select **Open on Scryfall**. A long list opens in two or more parts, because Scryfall searches have a length limit.

## Where your data is stored

Your lists, presets, history, and settings are stored in your browser, on your device. The app has no server and no accounts. To use the same lists on more than one device, turn on sync with GitHub (see the next section).

If you clear your browser's site data for the app, your data is deleted from that browser. To keep a copy, open **Data** and select **Export backup**. To restore it, select a backup file under **Import backup**. You can also use a backup to move your data to another device.

The app sends Scryfall your card searches. It also sends Scryfall IDs: those of a list's cards when you refresh the list, and a card's ID when you select **Show rulings**. It doesn't send list names, notes, or anything else about you. If you turn on sync, the app sends your lists, custom presets, and synced settings to your own private repository on [GitHub](https://github.com), and nothing else. The app sends Commander Spellbook nothing: its links put a card name or colors in the address, and you paste a list there yourself. Backups made by this version use backup schema 3, which adds deletion markers for sync. This version also imports schema 1 and 2 backups from earlier versions.

### Sync between devices with GitHub

Sync keeps your lists, custom presets, and some settings (nerd mode, **Draw** or **Browse**, and the **Browse** sort order) in one file in a private GitHub repository. Each device that you connect reads the file, merges it with its own data, and saves the result to the file. History stays on each device.

1. On GitHub, [create a repository](https://github.com/new). Make it **Private**.
2. In the app, open **Data**. Under **Sync with GitHub**, enter the repository as account/name.
3. Select **Create a token**. GitHub opens with the [fine-grained token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) settings filled in. Under **Repository access**, choose only your repository, then select **Generate token**.
4. Paste the token into **Token**, then select **Connect**.
5. Do the same on each other device.

The app syncs when it opens, when you come back to it after a minute, a few seconds after a change, and when you select **Sync now**. Each list syncs as a whole: when the same list changed on two devices between syncs, the copy that changed last wins, and the other device's changes to that list are lost. A delete reaches every device. The token stays in that browser only: it is never in a backup or in the sync file. **Disconnect** deletes it from the browser. The **Sync with GitHub** help page in the app has the details.

## Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `styles.css` | The page and its styles. |
| `src/main.js` | App startup and navigation between views. |
| `src/config.js` | The app name, API settings, and other constants. |
| `src/scryfall.js` | The Scryfall API client. All API requests go through its queue, which spaces requests at least 500 ms apart. |
| `src/github.js` | The GitHub API client for sync. It is the only code that sends requests to GitHub. |
| `src/query.js`, `src/cards.js`, `src/lists.js`, `src/deck-rules.js`, `src/export.js`, `src/draw.js`, `src/synergy.js`, `src/explore.js`, `src/browse.js`, `src/saved.js`, `src/stats.js`, `src/links.js`, `src/glossary.js`, `src/docs.js`, `src/combos.js`, `src/sync.js` | App logic with no DOM code. The tests cover these modules. |
| `src/docs.js` | The help pages shown in the **Help** view, and the text of every tooltip (`TIPS`). |
| `src/storage/` | Data storage in IndexedDB, with a memory fallback, and the sync cycle (`sync.js`). |
| `src/ui/` | The views, including the Help view (`help-view.js`), and the DOM helpers. |
| `tests/` | Unit tests, and saved Scryfall and GitHub responses (`tests/fixtures/`). |
| `scripts/` | Development tools: fixture download, live API checks, browser tests, icon drawing, the interface copy index (`ui-copy.mjs`), and the help link check (`check-links.mjs`). |
| `AGENTS.md`, `CLAUDE.md` | Instructions for coding agents. `AGENTS.md` is read by every agent. `CLAUDE.md` imports it and adds notes for Claude Code. |
| `.claude/rules/` | The detailed rules for agents: GitHub voice, shipping, design, the Scryfall API, storage, help docs, and GitHub sync. |
| `.claude/settings.json` | Shared Claude Code settings: no attribution in commits or pull requests, and a prompt before any force push. |
| `.agents/skills/` | Shared agent skills for Codex and Claude Code: **ship** and **plan-with-options**. `.claude/skills` links here. |
| `PLAN.md`, `REPORT.md` | The v1 plan, and the report on what was built, followed by the design overhaul, the feedback round, the combos work, the docs audit, the agent instructions, the help links and tooltips, and GitHub sync. |
| `docs/ui-copy.md` | The index of all interface copy, for audits. Generated by `scripts/ui-copy.mjs`. |

## Run the tests

The tests use the [Node.js built-in test runner](https://nodejs.org/api/test.html). You need Node.js 20 or later. There are no packages to install.

```sh
npm test
```

You can also run `node --test` directly.

The tests use real Scryfall responses saved in `tests/fixtures/`. To fetch them again, run `scripts/fetch-fixtures.sh`. To repeat the live API checks from section 9 of `PLAN.md`, and to check that every Scryfall Tagger tag that Explore uses still exists, run `node scripts/check-api.mjs`. Both scripts send the headers that Scryfall requires and wait at least 500 ms between requests.

To check that every link in the help pages still works, run `node scripts/check-links.mjs`. It sends one request at a time to each site, at least 500 ms apart.

`docs/ui-copy.md` lists every text the app shows or announces. `npm test` fails when it's out of date. To rebuild it, run `node scripts/ui-copy.mjs`.

### Browser tests

`node scripts/check-ui.mjs` runs the app in headless Chrome at phone width (390 px) and desktop width (1280 px), in light and dark mode. It checks controls, focus, layout, and the card image rules, and it fails if the page logs an error. To run one width only, set `ONLY` to the width, for example `ONLY=390 node scripts/check-ui.mjs`. Add `SCHEME=dark` for dark mode. It uses only Node.js built-ins and the Chrome installed on your computer. If Chrome is somewhere else, set `CHROME_PATH` to its executable. The app sends real Scryfall requests during the tests, through its own request queue. Requests to GitHub never leave the browser: the test script answers them from a fake private repository. Each run starts with an empty browser profile.

## Turn on GitHub Pages

GitHub Pages is turned on once, by hand. Agents don't change these settings. For details, see [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

1. On GitHub, open the repository, then select **Settings**.
2. In the sidebar, select **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to `/ (root)`, then select **Save**.
5. After a few minutes, the site is at `https://<user>.github.io/<repository>/`.

## Add the app to the Home Screen on iPhone

Safari deletes all of a site's stored data, including your lists, after 7 days of Safari use without a visit to that site. A web app on the Home Screen has its own counter, which resets each time you open the app. For details, see [WebKit's post on the 7-day cap](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).

To keep your lists:

1. Open the app in Safari.
2. Select the **Share** button.
3. Select **Add to Home Screen**, then select **Add**.
4. Open the app from the Home Screen icon from now on.

Also export a backup from the **Data** view from time to time, or turn on sync with GitHub. The app reminds you after your lists or presets change, if you've never backed up or your last backup is more than 14 days old.

## Change the app name

The app name is in one constant: `APP_NAME` in `src/config.js`. The page title, header, Fan Content notice, and help pages use it at run time.

The name also appears in files that load before the JavaScript runs. Change it in these places too:

- `index.html`: the `<title>` element, the header text, and the footer notice.
- `index.html`: also the `apple-mobile-web-app-title` meta element and the Scryfall line in the footer.
- `manifest.webmanifest`: `name` and `short_name`.
- `scripts/check-ui.mjs` and `tests/docs.test.js`: the checks for the name.

The name must not contain "Scryfall". Don't change `APP_ID` in `src/config.js`, because backup files use it.

## Credits

Card data and images are from [Scryfall](https://scryfall.com). Cascade is not made by or endorsed by Scryfall.

Combo searches link to [Commander Spellbook](https://commanderspellbook.com). Cascade is not made by or endorsed by Commander Spellbook.

Cascade is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
