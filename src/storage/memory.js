// An in-memory storage backend. The app uses it when IndexedDB is not
// available, and the tests use it. Data is lost when the page closes.

export const STORES = ["lists", "presets", "history", "meta"];

const clone = (v) => structuredClone(v);

export function createMemoryBackend() {
  /** @type {Record<string, Map<string, any>>} */
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return {
    persistent: false,
    async getAll(store) {
      return [...data[store].values()].map(clone);
    },
    async get(store, key) {
      const v = data[store].get(key);
      return v === undefined ? null : clone(v);
    },
    async put(store, value) {
      data[store].set(store === "meta" ? value.key : value.id, clone(value));
    },
    async delete(store, key) {
      data[store].delete(key);
    },
    async clear(store) {
      data[store].clear();
    },
    /** Replaces the content of the given stores in one step. */
    async replaceStores(contents) {
      for (const [store, values] of Object.entries(contents)) {
        data[store].clear();
        for (const v of values) data[store].set(store === "meta" ? v.key : v.id, clone(v));
      }
    },
  };
}
