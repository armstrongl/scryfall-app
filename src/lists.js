// List and entry operations. Pure module: every function returns a new object.

import { DECK_FORMATS, SECTIONS } from "./config.js";

/**
 * @typedef {import("./cards.js").CardSnapshot} CardSnapshot
 * @typedef {"commander"|"main"|"sideboard"|"maybe"} Section
 * @typedef {Object} Entry
 * @property {string} id
 * @property {CardSnapshot} card
 * @property {number} quantity A whole number, 1 or more.
 * @property {Section} section
 * @property {string} note
 * @property {string} addedAt
 * @typedef {Object} CardList
 * @property {string} id
 * @property {string} name
 * @property {"collection"|"deck"} kind
 * @property {"standard"|"standardbrawl"|"brawl"} format The deck format for checks and export.
 * @property {Entry[]} entries
 * @property {string} createdAt
 * @property {string} updatedAt
 * @typedef {Object} Clock
 * @property {() => string} now ISO 8601 date in UTC.
 * @property {() => string} makeId A new UUID.
 */

/** @type {Clock} */
export const defaultClock = {
  now: () => new Date().toISOString(),
  makeId: () => crypto.randomUUID(),
};

function cleanName(name) {
  const n = String(name ?? "").trim();
  if (!n) throw new Error("A list needs a name.");
  return n;
}

function cleanQuantity(q) {
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1) throw new Error("Quantity must be a whole number, 1 or more.");
  return n;
}

function cleanSection(s) {
  if (!SECTIONS.includes(s)) throw new Error(`Unknown section: ${s}`);
  return s;
}

/**
 * @param {string} name
 * @param {"collection"|"deck"} [kind]
 * @param {Clock} [clock]
 * @param {string} [format] A key in DECK_FORMATS. Unknown values give "standard".
 * @returns {CardList}
 */
export function createList(name, kind = "collection", clock = defaultClock, format = "standard") {
  const now = clock.now();
  return {
    id: clock.makeId(),
    name: cleanName(name),
    kind: kind === "deck" ? "deck" : "collection",
    format: DECK_FORMATS.includes(format) ? /** @type {any} */ (format) : "standard",
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

function touch(list, changes, clock) {
  return { ...list, ...changes, updatedAt: clock.now() };
}

export function renameList(list, name, clock = defaultClock) {
  return touch(list, { name: cleanName(name) }, clock);
}

/** Changes the kind. All entries stay. */
export function setKind(list, kind, clock = defaultClock) {
  if (kind !== "collection" && kind !== "deck") throw new Error(`Unknown kind: ${kind}`);
  return touch(list, { kind }, clock);
}

/** Changes the deck format. All entries stay. */
export function setFormat(list, format, clock = defaultClock) {
  if (!DECK_FORMATS.includes(format)) throw new Error(`Unknown format: ${format}`);
  return touch(list, { format }, clock);
}

/** True for formats with a commander and singleton rules. */
export function isBrawlFormat(format) {
  return format === "brawl" || format === "standardbrawl";
}

/**
 * Adds a card. If the same printing (Scryfall ID) is already in the same
 * section, its quantity goes up and no new entry is made.
 * @param {CardList} list
 * @param {CardSnapshot} card
 * @param {{quantity?: number, section?: Section, note?: string}} [options]
 * @param {Clock} [clock]
 */
export function addCard(list, card, options = {}, clock = defaultClock) {
  const quantity = cleanQuantity(options.quantity ?? 1);
  const section = cleanSection(options.section ?? "main");
  const note = String(options.note ?? "");
  const existing = list.entries.find(
    (e) => e.card.scryfallId === card.scryfallId && e.section === section,
  );
  let entries;
  if (existing) {
    entries = list.entries.map((e) =>
      e === existing
        ? { ...e, quantity: e.quantity + quantity, note: e.note || note }
        : e,
    );
  } else {
    entries = [
      ...list.entries,
      { id: clock.makeId(), card, quantity, section, note, addedAt: clock.now() },
    ];
  }
  return touch(list, { entries }, clock);
}

/**
 * Changes the quantity, section, or note of an entry. If a section change
 * puts the entry next to the same printing, the two entries merge.
 * @param {CardList} list
 * @param {string} entryId
 * @param {{quantity?: number, section?: Section, note?: string}} changes
 */
export function updateEntry(list, entryId, changes, clock = defaultClock) {
  const entry = list.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error("That entry is not in this list.");
  const next = { ...entry };
  if (changes.quantity !== undefined) next.quantity = cleanQuantity(changes.quantity);
  if (changes.section !== undefined) next.section = cleanSection(changes.section);
  if (changes.note !== undefined) next.note = String(changes.note);

  const twin = list.entries.find(
    (e) => e.id !== entryId && e.section === next.section && e.card.scryfallId === next.card.scryfallId,
  );
  let entries;
  if (twin) {
    entries = list.entries
      .filter((e) => e.id !== entryId)
      .map((e) =>
        e === twin
          ? { ...e, quantity: e.quantity + next.quantity, note: e.note || next.note }
          : e,
      );
  } else {
    entries = list.entries.map((e) => (e.id === entryId ? next : e));
  }
  return touch(list, { entries }, clock);
}

export function removeEntry(list, entryId, clock = defaultClock) {
  return touch(list, { entries: list.entries.filter((e) => e.id !== entryId) }, clock);
}

const byName = (a, b) => a.card.name.localeCompare(b.card.name);
const SORTS = {
  name: byName,
  manaValue: (a, b) => a.card.manaValue - b.card.manaValue || byName(a, b),
  type: (a, b) => a.card.typeLine.localeCompare(b.card.typeLine) || byName(a, b),
};

/**
 * @param {Entry[]} entries
 * @param {"name"|"manaValue"|"type"} by
 */
export function sortEntries(entries, by = "name") {
  return [...entries].sort(SORTS[by] ?? byName);
}

/**
 * The sections to show for a list: the commander section for Brawl formats,
 * the sideboard for Standard, and any other section that has cards.
 * @param {CardList} list
 * @returns {Section[]}
 */
export function sectionsFor(list) {
  const used = new Set(list.entries.map((e) => e.section));
  const brawl = list.kind === "deck" && isBrawlFormat(list.format);
  return /** @type {Section[]} */ (SECTIONS.filter((s) => used.has(s)
    || (s === "commander" && brawl)
    || (s === "sideboard" && !brawl)
    || s === "main" || s === "maybe"));
}

/**
 * Groups entries by section, in the fixed section order. The commander
 * section is left out unless `sections` names it or an entry is in it.
 * @param {Entry[]} entries
 * @param {"name"|"manaValue"|"type"} [by]
 * @param {Section[]} [sections]
 * @returns {{section: Section, entries: Entry[], total: number}[]}
 */
export function groupBySection(entries, by = "name", sections) {
  const list = sections ?? SECTIONS.filter((s) => s !== "commander" || entries.some((e) => e.section === "commander"));
  return list.map((section) => {
    const items = sortEntries(entries.filter((e) => e.section === section), by);
    return { section, entries: items, total: totalQuantity(items) };
  });
}

/** @param {Entry[]} entries */
export function totalQuantity(entries) {
  return entries.reduce((sum, e) => sum + e.quantity, 0);
}

/**
 * Replaces card snapshots with new data. Quantity, section, and note stay.
 * @param {CardList} list
 * @param {Map<string, CardSnapshot>} snapshotsById New snapshots by Scryfall ID.
 * @returns {{list: CardList, notFound: string[]}} notFound has the Scryfall IDs with no new data.
 */
export function applyRefresh(list, snapshotsById, clock = defaultClock) {
  const notFound = [];
  const entries = list.entries.map((e) => {
    const fresh = snapshotsById.get(e.card.scryfallId);
    if (!fresh) {
      if (!notFound.includes(e.card.scryfallId)) notFound.push(e.card.scryfallId);
      return e;
    }
    return { ...e, card: fresh };
  });
  return { list: touch(list, { entries }, clock), notFound };
}

/** The unique Scryfall IDs in a list, in entry order. */
export function scryfallIds(list) {
  return [...new Set(list.entries.map((e) => e.card.scryfallId))];
}

/**
 * Puts a removed entry back at its old position, for Undo. Does nothing if
 * the entry is already in the list.
 * @param {CardList} list
 * @param {Entry} entry
 * @param {number} index
 */
export function restoreEntry(list, entry, index, clock = defaultClock) {
  if (list.entries.some((e) => e.id === entry.id)) return list;
  const entries = [...list.entries];
  entries.splice(Math.min(Math.max(0, index), entries.length), 0, entry);
  return touch(list, { entries }, clock);
}
