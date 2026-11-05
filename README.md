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
