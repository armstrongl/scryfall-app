// The storage interface that the rest of the app uses (PLAN.md section 6).
// Code outside src/storage/ uses only the methods of the object that
// openStorage() returns. A later sync version can replace the backend
// without changes to the rest of the app.

import { HISTORY_LIMIT, SYNCED_SETTINGS } from "../config.js";
import { cleanSettings, defaultSettings, makeBackup, mergeData, replaceData } from "../export.js";
import { defaultClock } from "../lists.js";
import { createMemoryBackend } from "./memory.js";

/**
 * @typedef {import("../export.js").AppData} AppData
 * @typedef {import("../export.js").Backup} Backup
 * @typedef {import("../export.js").Settings} Settings
 * @typedef {import("../export.js").Deletion} Deletion
 * @typedef {Object} SyncState The GitHub connection. Kept apart from the
 *   settings, so that it is never in a backup or the sync file.
 * @property {string} owner
 * @property {string} repo
 * @property {string} token
 * @property {string|null} sha The sync file's sha at the last sync.
 * @property {string|null} lastSyncAt
 * @property {string|null} lastError An error code from src/sync.js, or null.
 */

const SYNC_KEY = "sync";

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

  /**
   * Saves the settings. syncSettingsAt moves to now only when a synced
   * setting changed, so a stale copy of the settings can't move it back.
   */
  async function saveSettings(settings) {
    const old = await getSettings();
    const changed = SYNCED_SETTINGS.some((k) => JSON.stringify(old[k]) !== JSON.stringify(settings[k]));
    const syncSettingsAt = changed ? clock.now() : old.syncSettingsAt;
    await backend.put("meta", { key: "settings", value: { ...settings, syncSettingsAt } });
  }

  async function markDeleted(id, kind) {
    const now = clock.now();
    await backend.put("deletions", { id, kind, deletedAt: now });
    await markChanged(now);
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
    const [lists, presets, history, settings, deletions] = await Promise.all([
      backend.getAll("lists"), backend.getAll("presets"), getHistory(), getSettings(), backend.getAll("deletions"),
    ]);
    return { lists, presets, history, settings, deletions };
  }

  /**
   * Replaces all data. The meta store isn't cleared, so the GitHub
   * connection stays as it is, even if it changes during the write.
   * @param {AppData} data
   */
  async function writeAll(data) {
    await backend.replaceStores({
      lists: data.lists,
      presets: data.presets,
      history: data.history.slice(0, HISTORY_LIMIT),
      deletions: data.deletions ?? [],
    });
    await backend.put("meta", { key: "settings", value: data.settings });
  }

  /**
   * Writes the result of a sync merge: lists, presets, deletion markers, and
   * settings. History isn't touched, because sync never changes it.
   * @param {AppData} data
   */
  async function writeSynced(data) {
    await backend.replaceStores({ lists: data.lists, presets: data.presets, deletions: data.deletions ?? [] });
    await backend.put("meta", { key: "settings", value: data.settings });
  }

  /**
   * While sync is on, Replace must win over the copy on GitHub: every item
   * it removes gets a deletion marker, and every item it brings in counts as
   * changed now.
   * @param {AppData} next
   * @param {AppData} current
   */
  function replaceForSync(next, current) {
    const now = clock.now();
    const keep = new Set([...next.lists, ...next.presets].map((x) => x.id));
    const marks = new Map((next.deletions ?? []).filter((d) => !keep.has(d.id)).map((d) => [d.id, d]));
    for (const l of current.lists) if (!keep.has(l.id)) marks.set(l.id, { id: l.id, kind: "list", deletedAt: now });
    for (const p of current.presets) if (!keep.has(p.id)) marks.set(p.id, { id: p.id, kind: "preset", deletedAt: now });
    return {
      ...next,
      lists: next.lists.map((l) => ({ ...l, updatedAt: now })),
      presets: next.presets.map((p) => ({ ...p, updatedAt: now })),
      deletions: [...marks.values()],
    };
  }

  return {
    /** True when data stays after the page closes. */
    persistent: backend.persistent,
    getLists: () => backend.getAll("lists"),
    getList: (id) => backend.get("lists", id),
    /** Creates or replaces a list, and sets updatedAt. */
    /** Creates or replaces a list, and sets updatedAt. Saving a deleted list again undoes the delete. */
    async saveList(list) {
      const now = clock.now();
      await backend.put("lists", { ...list, updatedAt: now });
      await backend.delete("deletions", list.id);
      await markChanged(now);
    },
    /** Deletes a list and leaves a deletion marker for sync. */
    async deleteList(id) {
      await backend.delete("lists", id);
      await markDeleted(id, "list");
    },
    getPresets: () => backend.getAll("presets"),
    async savePreset(preset) {
      const now = clock.now();
      await backend.put("presets", { ...preset, builtIn: false, updatedAt: now });
      await backend.delete("deletions", preset.id);
      await markChanged(now);
    },
    async deletePreset(id) {
      await backend.delete("presets", id);
      await markDeleted(id, "preset");
    },
    /** @returns {Promise<Deletion[]>} */
    getDeletions: () => backend.getAll("deletions"),
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
      const current = await collect();
      let next = mode === "replace" ? replaceData(backup) : mergeData(current, backup);
      if (mode === "replace" && (await backend.get("meta", SYNC_KEY))) next = replaceForSync(next, current);
      await writeAll(next);
    },
    /** All data, for sync. */
    collect,
    /**
     * Replaces all data with the result of a sync merge. The GitHub
     * connection stays, and the change date and backup date don't move.
     * @param {AppData} data
     */
    writeSynced,
    /** @returns {Promise<SyncState|null>} */
    async getSyncState() {
      return (await backend.get("meta", SYNC_KEY))?.value ?? null;
    },
    /** @param {SyncState} state */
    async saveSyncState(state) {
      await backend.put("meta", { key: SYNC_KEY, value: state });
    },
    /** Removes the GitHub connection and its token. */
    async clearSyncState() {
      await backend.delete("meta", SYNC_KEY);
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
