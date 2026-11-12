---
paths:
  - "src/storage/**"
  - "src/export.js"
  - "src/config.js"
---

# Storage and backups

Saved lists live in the browser, and in a GitHub repository too when sync is on ([GitHub sync](github-sync.md)). A mistake here can lose them, so ask in the session before any change that could lose or damage saved lists.

## IndexedDB

- To change the schema, raise `DB_VERSION` in `src/config.js` and add a step to `UPGRADES` in `src/storage/indexeddb.js`.
- Never edit an earlier upgrade step. Browsers that already ran it won't run it again.
- Version 2 added the `deletions` store. `scripts/check-ui.mjs` builds a version 1 database with a saved list, opens the app, and checks that the list is still there. Add a check like it for each new upgrade step.
- If IndexedDB fails, `src/storage/memory.js` takes over and the app says that lists can't be saved. Keep that fallback.
- Storage tests use `createMemoryBackend()` from `src/storage/memory.js` in place of IndexedDB. See the [IndexedDB API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Backups

- To change the backup format, raise `BACKUP_SCHEMA_VERSION` in `src/config.js`, add it to `READABLE_BACKUP_VERSIONS`, and keep the import checks in `src/export.js` in step with it.
- Old backups must still import. Add a test with an old backup when the format changes.
- Don't change `APP_ID` in `src/config.js`. Backup files use it.
- Schema 3 added `deletions`: markers that a list or preset was deleted, so that a delete reaches other synced devices. `deleteList()` and `deletePreset()` leave one, and saving the item again removes it.
- Data that belongs to one device never goes in a backup. The GitHub connection and its token are in the `sync` record of the `meta` store, apart from the settings, and `writeAll()` keeps that record when an import replaces everything.

## Durability

- The app calls [`navigator.storage.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) after the first save.
- Safari deletes a site's data after 7 days of Safari use without a visit, unless the site is on the Home Screen. The app is used on an iPhone in a normal Safari tab, and lists went missing there on 5 November 2026. Keep the backup reminder in **Data**, and keep the advice to add the app to the Home Screen.
