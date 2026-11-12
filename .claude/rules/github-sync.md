---
paths:
  - "src/github.js"
  - "src/sync.js"
  - "src/storage/sync.js"
---

# GitHub sync

Sync keeps lists, custom presets, and some settings in one file in a private GitHub repository. Each device reads the file, merges it with its own data, and writes the result back. There is no server. Requested on 12 November 2026, with these choices: a private repository (not a gist), a pasted fine-grained token, sync on open, a few seconds after each change, and from **Sync now**, deletion markers, and the newer change winning.

## Requests

- Only `src/github.js` sends requests to `api.github.com`. It sends `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, and `X-GitHub-Api-Version`. Never set `User-Agent` in browser code.
- Use only the [repository contents API](https://docs.github.com/en/rest/repos/contents) and [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository). GitHub's sign-in pages refuse requests from other sites, so there is no "Sign in with GitHub". Don't add a proxy or a server.
- Every write sends the sha of the file it read. When GitHub refuses the write (409 or 422), read again, merge again, and write again, up to `SYNC_MAX_TRIES` times.
- Don't sync more often than the triggers in `src/main.js`: on open, when the app comes back into view after `SYNC_ON_SHOW_MS`, `SYNC_DEBOUNCE_MS` after a change, and from **Sync now**. Each write is a commit in the repository.
- A sync never sends a request to Scryfall. Saved cards stay snapshots.

## The token

- The token lives only in the `sync` record of the `meta` store. Never put it in the settings, a backup, the sync file, the page, a log, or a URL. `tests/sync.test.js` and the browser checks test this.
- Connect refuses a public repository, because anyone can read one.
- **Disconnect** deletes the token from the browser. It doesn't change the data on the device or on GitHub.

## The sync file

- The file is `SYNC_FILE_NAME` in `src/config.js`. Don't change the name: devices that are already connected look for it.
- It is a backup in the current schema, with no history and only the settings in `SYNCED_SETTINGS`. Items are sorted by ID, so that the same data gives the same file and an unchanged sync writes nothing.
- A file that isn't a valid backup stops the sync with no changes on either side.

## Merging

- Lists and presets merge by ID, and the later `updatedAt` wins. Deletion markers from both sides apply: an item deleted at or after its last change goes, and a marker for an item changed after the delete goes. Markers older than `DELETION_KEEP_DAYS` are removed.
- Synced settings come from the side with the later `syncSettingsAt`. `saveSettings()` in `src/storage/index.js` moves it only when a synced setting changes.
- Device-only data stays: history, the last search, the last list used, and the backup and change dates.
- A sync writes only lists, presets, deletion markers, and settings (`writeSynced()`), never history or the `sync` record. Just before it writes, it reads local data again, and starts over if anything changed. It updates the `sync` record only if the connection is still the one it started with, so a Disconnect during a sync stays.
- `onLocalChange` reloads the app as soon as a sync changed local data, before the write to GitHub. Views must never edit a copy older than storage.
- Replace import while connected leaves deletion markers for everything it removes and dates everything it brings in now, so the replacement wins on GitHub too.

## Tests

- Unit tests in `tests/sync.test.js` run the whole cycle against a fake GitHub with memory storage. The fake answers with real response bodies from `tests/fixtures/github-*.json`, fetched by `scripts/fetch-fixtures.sh`.
- `scripts/check-ui.mjs` answers every request to `api.github.com` itself through the DevTools Fetch domain. The browser checks never reach GitHub.
