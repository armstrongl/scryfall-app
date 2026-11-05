# Card discovery

Card discovery finds random Magic: The Gathering cards that match criteria you choose. You can save cards to lists, turn a list into a Standard deck, check the deck against the Standard rules, and export it as text that MTG Arena can import. The app runs in your browser, and it gets card data and images from the [Scryfall API](https://scryfall.com/docs/api). It has no server and no accounts.

"Card discovery" is a working title. See [Change the app name](#change-the-app-name).

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

The app has three views. Select them at the top of the page.

### Find cards

1. Open **Discover**.
2. Under **Criteria**, choose what the cards must match, for example colors, mana value, or card type. The query preview shows the Scryfall search that the criteria make, and the app shows how many cards match. On a phone, select **Criteria** to open the panel.
3. Choose how many cards to draw, from 1 to 10, then select **Draw**.

The built-in **Arena Standard** preset finds cards that are legal in Standard and available on MTG Arena. To keep a set of criteria, select **Save as new preset**. Your draws are kept under **History**.

### Save cards to a list

1. On a drawn card, select **Add to list**.
2. Choose one or more lists, or make a new one. Set the quantity and the section: **Main deck**, **Sideboard**, or **Maybe**.
3. Select **Add**.

A list is a **Collection** or a **Deck (Standard)**. You can change the kind at any time in the **Lists** view, and the cards stay.

### Find cards that work together

1. On a drawn card, a card in **History**, or a card in a list, select **Find synergies**.
2. The panel lists searches that the app makes from the card's rules text and types. For example, a card that sacrifices creatures gets a search for cards that do something when a creature dies, and an Elf gets a search for cards that reward Elves.
3. Select **Search in Discover** on one of them. Discover opens with that search. It keeps your format and game, includes only cards in the card's colors, and leaves out the card itself.
4. Select **Draw**, or change the criteria first.

The suggestions come from patterns in the card's text, so some matches are loose. The app doesn't send a request until you count or draw cards.

### Build and export a deck

1. Open **Lists**, then open a list with the kind **Deck (Standard)**.
2. Read the **Standard deck checks**. They show problems such as a main deck under 60 cards, a sideboard over 15 cards, more than 4 copies of a card, or a card that is not legal in Standard. Legality comes from the card data saved with the list. To get current data, select **Refresh card data**.
3. Select **Export for Arena**, then select **Copy**.
4. In MTG Arena, open **Decks**, then select **Import**.

## Where your data is stored

Your lists, presets, history, and settings are stored only in your browser, on your device. The app has no server and no accounts, so your data doesn't sync between devices or browsers.

If you clear your browser's site data for the app, your data is deleted. To keep a copy, open **Data** and select **Export backup**. To restore it, select a backup file under **Import backup**. You can also use a backup to move your data to another device.

The app sends Scryfall your card searches and, when you refresh a list, the Scryfall IDs of its cards. It doesn't send list names, notes, or anything else about you.

## Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `styles.css` | The page and its styles. |
| `src/main.js` | App startup and navigation between views. |
| `src/config.js` | The app name, API settings, and other constants. |
| `src/scryfall.js` | The Scryfall API client. All API requests go through its queue, which spaces requests at least 500 ms apart. |
| `src/query.js`, `src/cards.js`, `src/lists.js`, `src/deck-rules.js`, `src/export.js`, `src/draw.js`, `src/synergy.js` | App logic with no DOM code. The tests cover these modules. |
| `src/storage/` | Data storage in IndexedDB, with a memory fallback. |
| `src/ui/` | The views and the DOM helpers. |
| `tests/` | Unit tests and saved Scryfall responses (`tests/fixtures/`). |
| `scripts/` | Development tools: fixture download, live API checks, and icon drawing. |
| `PLAN.md`, `REPORT.md` | The v1 plan and the report on what was built. |

## Run the tests

The tests use the [Node.js built-in test runner](https://nodejs.org/api/test.html). You need Node.js 20 or later. There are no packages to install.

```sh
npm test
```

You can also run `node --test` directly.

The tests use real Scryfall responses saved in `tests/fixtures/`. To fetch them again, run `scripts/fetch-fixtures.sh`. To repeat the live API checks from section 9 of `PLAN.md`, run `node scripts/check-api.mjs`. Both scripts send the headers that Scryfall requires and wait at least 500 ms between requests.

## Turn on GitHub Pages

The repository owner does this once. For details, see [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

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

Also export a backup from the **Data** view from time to time. The app reminds you when your lists changed and your last backup is more than 14 days old.

## Change the app name

The app name is in one constant: `APP_NAME` in `src/config.js`. The page title, header, and Fan Content notice use it at run time.

The name also appears in files that load before the JavaScript runs. Change it in these places too:

- `index.html`: the `<title>` element, the header text, and the footer notice.
- `manifest.webmanifest`: `name` and `short_name`.

The name must not contain "Scryfall". Don't change `APP_ID` in `src/config.js`, because backup files use it.

## Credits

Card data and images are from [Scryfall](https://scryfall.com). Card discovery is not made by or endorsed by Scryfall.

Card discovery is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
