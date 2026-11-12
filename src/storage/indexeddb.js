// The IndexedDB storage backend. Only src/storage/index.js uses this module.

import { DB_NAME, DB_VERSION } from "../config.js";
import { STORES } from "./memory.js";

/**
 * Schema upgrades, one function for each version. Add a new function and
 * raise DB_VERSION in config.js to change the schema.
 * @type {Record<number, (db: IDBDatabase, tx: IDBTransaction) => void>}
 */
const UPGRADES = {
  1(db) {
    db.createObjectStore("lists", { keyPath: "id" });
    db.createObjectStore("presets", { keyPath: "id" });
    const history = db.createObjectStore("history", { keyPath: "id" });
    history.createIndex("drawnAt", "drawnAt");
    db.createObjectStore("meta", { keyPath: "key" });
  },
  // Deletion markers, so that a delete reaches other synced devices.
  2(db) {
    db.createObjectStore("deletions", { keyPath: "id" });
  },
};

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("The storage transaction stopped."));
  });
}

/** @returns {Promise<IDBDatabase>} */
function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion + 1; v <= DB_VERSION; v++) UPGRADES[v]?.(db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other tabs of this app, then reload."));
  });
}

/**
 * Opens the database. Rejects if IndexedDB is not available.
 * @param {IDBFactory} [indexedDB]
 */
export async function createIndexedDbBackend(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error("IndexedDB is not available.");
  const db = await openDb(indexedDB);

  const run = async (store, mode, fn) => {
    const tx = db.transaction(store, mode);
    const result = await promisify(fn(tx.objectStore(store)));
    await done(tx);
    return result;
  };

  return {
    persistent: true,
    getAll: (store) => run(store, "readonly", (s) => s.getAll()),
    get: async (store, key) => (await run(store, "readonly", (s) => s.get(key))) ?? null,
    put: (store, value) => run(store, "readwrite", (s) => s.put(value)).then(() => {}),
    delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)).then(() => {}),
    clear: (store) => run(store, "readwrite", (s) => s.clear()).then(() => {}),
    async replaceStores(contents) {
      const names = Object.keys(contents).filter((n) => STORES.includes(n));
      const tx = db.transaction(names, "readwrite");
      for (const name of names) {
        const s = tx.objectStore(name);
        s.clear();
        for (const v of contents[name]) s.put(v);
      }
      await done(tx);
    },
  };
}
