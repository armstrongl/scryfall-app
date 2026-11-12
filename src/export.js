// Arena text export, JSON backup, and import checks. Pure module.

import { APP_ID, BACKUP_SCHEMA_VERSION, DECK_FORMATS, HISTORY_LIMIT, READABLE_BACKUP_VERSIONS, SECTIONS } from "./config.js";
import { isBrawlFormat } from "./lists.js";
import { normalizeCriteria } from "./query.js";
import { normalizeSort } from "./browse.js";

/**
 * @typedef {import("./lists.js").CardList} CardList
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {boolean} builtIn
 * @property {import("./query.js").Criteria} criteria
 * @property {string} createdAt
 * @property {string} updatedAt
 * @typedef {Object} HistoryItem
 * @property {string} id
 * @property {import("./cards.js").CardSnapshot} card
 * @property {string} query
 * @property {string} drawnAt
 * @typedef {Object} Settings
 * @property {import("./query.js").Criteria} lastCriteria
 * @property {string|null} lastUsedListId
 * @property {string|null} lastBackupAt
 * @property {string|null} lastChangeAt
 * @property {"comfortable"|"nerd"} density Nerd mode shows more card details.
 * @property {"draw"|"browse"} discoverMode
 * @property {import("./browse.js").BrowseSort} browseSort
 * @property {string|null} syncSettingsAt When a synced setting last changed.
 * @typedef {Object} Deletion A marker that a list or preset was deleted.
 * @property {string} id
 * @property {"list"|"preset"} kind
 * @property {string} deletedAt
 * @typedef {Object} AppData
 * @property {CardList[]} lists
 * @property {Preset[]} presets Custom presets only.
 * @property {HistoryItem[]} history
 * @property {Settings} settings
 * @property {Deletion[]} [deletions] Missing in backups before schema 3.
 * @typedef {AppData & {app: string, schemaVersion: number, exportedAt: string}} Backup
 */

/** @returns {Settings} */
export function defaultSettings() {
  return {
    lastCriteria: normalizeCriteria(null),
    lastUsedListId: null,
    lastBackupAt: null,
    lastChangeAt: null,
    density: "comfortable",
    discoverMode: "draw",
    browseSort: { order: "name", dir: "auto" },
    syncSettingsAt: null,
  };
}

/**
 * MTG Arena import text. Standard: main deck lines, then a Sideboard block.
 * Brawl formats: a Commander block, then a Deck block, and no sideboard. The
 * "maybe" section is never exported.
 * @param {CardList} list
 */
export function arenaText(list) {
  const lines = (section) =>
    list.entries.filter((e) => e.section === section).map((e) => `${e.quantity} ${e.card.frontName}`);
  const main = lines("main");
  const side = lines("sideboard");
  const commander = lines("commander");
  // The layout follows the deck's format. A Standard deck never exports a
  // Commander block, even if it still has a commander entry.
  if (isBrawlFormat(list.format)) {
    const out = [];
    if (commander.length > 0) out.push("Commander", ...commander, "");
    // Brawl decks have no sideboard, so the sideboard is not exported.
    out.push("Deck", ...main);
    return out.join("\n");
  }
  const out = [...main];
  if (side.length > 0) out.push("", "Sideboard", ...side);
  return out.join("\n");
}

/**
 * @param {AppData} data
 * @param {string} exportedAt
 * @returns {Backup}
 */
export function makeBackup(data, exportedAt) {
  return {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    lists: data.lists,
    presets: data.presets.filter((p) => !p.builtIn),
    history: data.history,
    settings: data.settings,
    deletions: data.deletions ?? [],
  };
}

/** @param {string} isoDate */
export function backupFileName(isoDate) {
  return `${APP_ID}-backup-${isoDate.slice(0, 10)}.json`;
}

/** "1 and 2", or "1, 2, and 3". */
const listWords = (items) =>
  items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
const isStr = (v) => typeof v === "string";
const isDate = (v) => isStr(v) && !Number.isNaN(Date.parse(v));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkSnapshot(card, where, errors) {
  if (!isObj(card)) return errors.push(`${where}: the card data is missing.`);
  for (const f of ["scryfallId", "name", "frontName", "set", "rarity", "typeLine", "fetchedAt"]) {
    if (!isStr(card[f])) errors.push(`${where}: the card field "${f}" is missing or not text.`);
  }
  if (!Array.isArray(card.images)) errors.push(`${where}: the card field "images" is not a list.`);
}

function checkRecord(item, where, errors, dateFields) {
  if (!isObj(item)) {
    errors.push(`${where} is not an object.`);
    return false;
  }
  if (!isStr(item.id) || !item.id) errors.push(`${where} has no ID.`);
  for (const f of dateFields) if (!isDate(item[f])) errors.push(`${where} has no valid "${f}" date.`);
  return true;
}

/**
 * Checks a parsed backup file. Changes nothing.
 * @param {any} file
 * @returns {{ok: true, backup: Backup, counts: {lists: number, presets: number, history: number}} | {ok: false, errors: string[]}}
 */
export function validateBackup(file) {
  const errors = [];
  if (!isObj(file)) return { ok: false, errors: ["The file is not a backup from this app."] };
  if (file.app !== APP_ID) return { ok: false, errors: ["The file is not a backup from this app."] };
  if (!READABLE_BACKUP_VERSIONS.includes(file.schemaVersion)) {
    return {
      ok: false,
      errors: [`The backup has schema version ${JSON.stringify(file.schemaVersion)}. This app reads versions ${listWords(READABLE_BACKUP_VERSIONS)} only.`],
    };
  }
  for (const key of ["lists", "presets", "history"]) {
    if (!Array.isArray(file[key])) errors.push(`The backup has no "${key}" list.`);
  }
  if (!isObj(file.settings)) errors.push('The backup has no "settings" object.');
  if (file.schemaVersion >= 3 && !Array.isArray(file.deletions)) errors.push('The backup has no "deletions" list.');
  if (errors.length) return { ok: false, errors };

  file.lists.forEach((list, i) => {
    const where = `List ${i + 1}`;
    if (!checkRecord(list, where, errors, ["createdAt", "updatedAt"])) return;
    if (!isStr(list.name)) errors.push(`${where} has no name.`);
    if (list.kind !== "collection" && list.kind !== "deck") errors.push(`${where} has an unknown kind.`);
    if (list.format !== undefined && !DECK_FORMATS.includes(list.format)) errors.push(`${where} has an unknown format.`);
    if (!Array.isArray(list.entries)) return errors.push(`${where} has no entries list.`);
    list.entries.forEach((e, j) => {
      const ew = `${where}, entry ${j + 1}`;
      if (!checkRecord(e, ew, errors, ["addedAt"])) return;
      if (!Number.isInteger(e.quantity) || e.quantity < 1) errors.push(`${ew} has a quantity that is not a whole number, 1 or more.`);
      if (!SECTIONS.includes(e.section)) errors.push(`${ew} has an unknown section.`);
      if (!isStr(e.note)) errors.push(`${ew} has a note that is not text.`);
      checkSnapshot(e.card, ew, errors);
    });
  });
  file.presets.forEach((p, i) => {
    const where = `Preset ${i + 1}`;
    if (!checkRecord(p, where, errors, ["createdAt", "updatedAt"])) return;
    if (!isStr(p.name)) errors.push(`${where} has no name.`);
    if (!isObj(p.criteria)) errors.push(`${where} has no criteria.`);
  });
  file.history.forEach((h, i) => {
    const where = `History item ${i + 1}`;
    if (!checkRecord(h, where, errors, ["drawnAt"])) return;
    if (!isStr(h.query)) errors.push(`${where} has no query.`);
    checkSnapshot(h.card, where, errors);
  });
  (file.deletions ?? []).forEach((d, i) => {
    const where = `Deletion marker ${i + 1}`;
    if (!checkRecord(d, where, errors, ["deletedAt"])) return;
    if (d.kind !== "list" && d.kind !== "preset") errors.push(`${where} has an unknown kind.`);
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    backup: file,
    counts: { lists: file.lists.length, presets: file.presets.length, history: file.history.length },
  };
}

/**
 * Makes valid settings from any input, such as stored data or a backup.
 * Unknown or wrong values fall back to the defaults.
 */
export function cleanSettings(s) {
  const d = defaultSettings();
  const dateOrNull = (v) => (isDate(v) ? v : null);
  return {
    lastCriteria: normalizeCriteria(s?.lastCriteria),
    lastUsedListId: isStr(s?.lastUsedListId) ? s.lastUsedListId : d.lastUsedListId,
    lastBackupAt: dateOrNull(s?.lastBackupAt),
    lastChangeAt: dateOrNull(s?.lastChangeAt),
    density: s?.density === "nerd" ? "nerd" : d.density,
    discoverMode: s?.discoverMode === "browse" ? "browse" : d.discoverMode,
    browseSort: normalizeSort(s?.browseSort),
    syncSettingsAt: dateOrNull(s?.syncSettingsAt),
  };
}

function cleanPresets(presets) {
  return presets
    .filter((p) => !p.builtIn)
    .map((p) => ({ ...p, builtIn: false, criteria: normalizeCriteria(p.criteria) }));
}

function newestHistory(items) {
  return [...items].sort((a, b) => b.drawnAt.localeCompare(a.drawnAt)).slice(0, HISTORY_LIMIT);
}

/**
 * Replace: the file's data, including its settings, becomes all of the data.
 * @param {Backup} backup
 * @returns {AppData}
 */
export function replaceData(backup) {
  return {
    lists: backup.lists,
    presets: cleanPresets(backup.presets),
    history: newestHistory(backup.history),
    settings: cleanSettings(backup.settings),
    deletions: backup.deletions ?? [],
  };
}

/**
 * Merges deletion markers by ID, keeping the later delete. Then removes each
 * item deleted at or after its last change, and each marker whose item
 * changed after the delete (an Undo, or an edit on another device).
 * @param {{lists: any[], presets: any[]}} data
 * @param {Deletion[]} current
 * @param {Deletion[]} incoming
 */
export function applyDeletions(data, current, incoming) {
  const marks = new Map(current.map((d) => [d.id, d]));
  for (const d of incoming) {
    const have = marks.get(d.id);
    if (!have || d.deletedAt > have.deletedAt) marks.set(d.id, d);
  }
  const keep = (item) => !(marks.get(item.id)?.deletedAt >= item.updatedAt);
  const lists = data.lists.filter(keep);
  const presets = data.presets.filter(keep);
  const alive = new Set([...lists, ...presets].map((x) => x.id));
  return { lists, presets, deletions: [...marks.values()].filter((d) => !alive.has(d.id)) };
}

/**
 * Merge: new IDs are added. For an ID that already exists, the item with the
 * later updatedAt stays. Deletion markers from both sides apply (see
 * applyDeletions). History items with an existing ID are skipped. The
 * current settings stay.
 * @param {AppData} current
 * @param {Backup} backup
 * @returns {AppData}
 */
export function mergeData(current, backup) {
  const mergeById = (mine, theirs) => {
    const map = new Map(mine.map((x) => [x.id, x]));
    for (const item of theirs) {
      const have = map.get(item.id);
      if (!have || item.updatedAt > have.updatedAt) map.set(item.id, item);
    }
    return [...map.values()];
  };
  const historyIds = new Set(current.history.map((h) => h.id));
  const merged = applyDeletions(
    { lists: mergeById(current.lists, backup.lists), presets: mergeById(current.presets, cleanPresets(backup.presets)) },
    current.deletions ?? [],
    backup.deletions ?? [],
  );
  return {
    ...merged,
    history: newestHistory([...current.history, ...backup.history.filter((h) => !historyIds.has(h.id))]),
    settings: current.settings,
  };
}

/**
 * True when the app shows the backup reminder.
 * @param {Settings} settings
 * @param {number} nowMs
 * @param {number} days
 */
export function needsBackupReminder(settings, nowMs, days) {
  if (!settings.lastChangeAt) return false;
  if (!settings.lastBackupAt) return true;
  const changedAfter = settings.lastChangeAt > settings.lastBackupAt;
  const old = nowMs - Date.parse(settings.lastBackupAt) > days * 24 * 60 * 60 * 1000;
  return changedAfter && old;
}
