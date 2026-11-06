// The storage interface that the rest of the app uses (PLAN.md section 6).
// Code outside src/storage/ uses only the methods of the object that
// openStorage() returns. A later sync version can replace the backend
// without changes to the rest of the app.

import { HISTORY_LIMIT } from "../config.js";
import { cleanSettings, defaultSettings, makeBackup, mergeData, replaceData } from "../export.js";
import { defaultClock } from "../lists.js";
import { createMemoryBackend } from "./memory.js";

/**
 * @typedef {import("../export.js").AppData} AppData
 * @typedef {import("../export.js").Backup} Backup
 * @typedef {import("../export.js").Settings} Settings
 */

/**
 * Builds the Storage interface on top of a backend.
 * @param {ReturnType<typeof createMemoryBackend>} backend
 * @param {{now: () => string}} [clock]
 */
export function createStorage(backend, clock = defaultClock) {
  async function getSettings() {
    const rec = await backend.get("meta", "settings");
    if (!rec) return defaultSettings();
    return cleanSettings(rec.value);
  }

  async function saveSettings(settings) {
    await backend.put("meta", { key: "settings", value: settings });
  }

  async function markChanged(at) {
    const s = await getSettings();
    await saveSettings({ ...s, lastChangeAt: at });
  }

  async function getHistory() {
    const items = await backend.getAll("history");
    return items.sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
  }

  async function collect() {
    const [lists, presets, history, settings] = await Promise.all([
      backend.getAll("lists"), backend.getAll("presets"), getHistory(), getSettings(),
    ]);
    return { lists, presets, history, settings };
  }

  /** @param {AppData} data */
  async function writeAll(data) {
    await backend.replaceStores({
      lists: data.lists,
      presets: data.presets,
      history: data.history.slice(0, HISTORY_LIMIT),
      meta: [{ key: "settings", value: data.settings }],
    });
  }

  return {
    /** True when data stays after the page closes. */
    persistent: backend.persistent,
    getLists: () => backend.getAll("lists"),
    getList: (id) => backend.get("lists", id),
    /** Creates or replaces a list, and sets updatedAt. */
    async saveList(list) {
      const now = clock.now();
      await backend.put("lists", { ...list, updatedAt: now });
      await markChanged(now);
    },
    async deleteList(id) {
      await backend.delete("lists", id);
      await markChanged(clock.now());
    },
    getPresets: () => backend.getAll("presets"),
    async savePreset(preset) {
      const now = clock.now();
      await backend.put("presets", { ...preset, builtIn: false, updatedAt: now });
      await markChanged(now);
    },
    async deletePreset(id) {
      await backend.delete("presets", id);
      await markChanged(clock.now());
    },
    getHistory,
    /** Adds an item and keeps the newest HISTORY_LIMIT items. */
    async addHistory(item) {
      await backend.put("history", item);
      const items = await getHistory();
      for (const old of items.slice(HISTORY_LIMIT)) await backend.delete("history", old.id);
    },
    clearHistory: () => backend.clear("history"),
    getSettings,
    saveSettings,
    /** @returns {Promise<Backup>} */
    async exportAll() {
      return makeBackup(await collect(), clock.now());
    },
    /**
     * @param {Backup} backup A backup that validateBackup() accepted.
     * @param {"merge"|"replace"} mode
     */
    async importAll(backup, mode) {
      const next = mode === "replace" ? replaceData(backup) : mergeData(await collect(), backup);
      await writeAll(next);
    },
  };
}

/**
 * Opens IndexedDB storage. If that fails, returns memory storage so that
 * discovery still works, with `persistent` set to false.
 * @returns {Promise<{storage: ReturnType<typeof createStorage>, error: Error|null}>}
 */
export async function openStorage() {
  try {
    const { createIndexedDbBackend } = await import("./indexeddb.js");
    const backend = await createIndexedDbBackend();
    const storage = createStorage(backend);
    await storage.getSettings(); // Fails early if the browser blocks reads.
    return { storage, error: null };
  } catch (error) {
    return { storage: createStorage(createMemoryBackend()), error: /** @type {Error} */ (error) };
  }
}

/**
 * Asks the browser to keep the data. Returns "persistent", "best-effort",
 * or "unknown" if the browser does not support the API.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return "unknown";
    if (await navigator.storage.persisted()) return "persistent";
    return (await navigator.storage.persist()) ? "persistent" : "best-effort";
  } catch {
    return "unknown";
  }
}

/** Reports whether the browser has granted persistent storage, without asking. */
export async function persistenceStatus() {
  try {
    if (!navigator.storage?.persisted) return "unknown";
    return (await navigator.storage.persisted()) ? "persistent" : "best-effort";
  } catch {
    return "unknown";
  }
}
