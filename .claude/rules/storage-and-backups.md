---
paths:
  - "src/storage/**"
  - "src/export.js"
  - "src/config.js"
---

# Storage and backups

Saved lists live only in the browser. A mistake here can lose them, so ask in the session before any change that could lose or damage saved lists.

## IndexedDB

- To change the schema, raise `DB_VERSION` in `src/config.js` and add a step to `UPGRADES` in `src/storage/indexeddb.js`.
- Never edit an earlier upgrade step. Browsers that already ran it won't run it again.
- If IndexedDB fails, `src/storage/memory.js` takes over and the app says that lists can't be saved. Keep that fallback.
- Storage tests use `createMemoryBackend()` from `src/storage/memory.js` in place of IndexedDB. See the [IndexedDB API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Backups

- To change the backup format, raise `BACKUP_SCHEMA_VERSION` in `src/config.js`, add it to `READABLE_BACKUP_VERSIONS`, and keep the import checks in `src/export.js` in step with it.
- Old backups must still import. Add a test with an old backup when the format changes.
- Don't change `APP_ID` in `src/config.js`. Backup files use it.

## Durability

- The app calls [`navigator.storage.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) after the first save.
- Safari deletes a site's data after 7 days of Safari use without a visit, unless the site is on the Home Screen. The app is used on an iPhone in a normal Safari tab, and lists went missing there on 5 November 2026. Keep the backup reminder in **Data**, and keep the advice to add the app to the Home Screen.
