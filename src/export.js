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
 * @typedef {Object} AppData
 * @property {CardList[]} lists
 * @property {Preset[]} presets Custom presets only.
 * @property {HistoryItem[]} history
 * @property {Settings} settings
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
  if (isBrawlFormat(list.format) || commander.length > 0) {
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
  };
}

/** @param {string} isoDate */
export function backupFileName(isoDate) {
  return `${APP_ID}-backup-${isoDate.slice(0, 10)}.json`;
}

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
      errors: [`The backup has schema version ${JSON.stringify(file.schemaVersion)}. This app reads versions ${READABLE_BACKUP_VERSIONS.join(" and ")} only.`],
    };
  }
  for (const key of ["lists", "presets", "history"]) {
    if (!Array.isArray(file[key])) errors.push(`The backup has no "${key}" list.`);
  }
  if (!isObj(file.settings)) errors.push('The backup has no "settings" object.');
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

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    backup: file,
    counts: { lists: file.lists.length, presets: file.presets.length, history: file.history.length },
  };
}

function cleanSettings(s) {
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
  };
}

/**
 * Merge: new IDs are added. For an ID that already exists, the item with the
 * later updatedAt stays. History items with an existing ID are skipped. The
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
  return {
    lists: mergeById(current.lists, backup.lists),
    presets: mergeById(current.presets, cleanPresets(backup.presets)),
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
