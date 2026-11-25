// Deck mode: one deck chosen to work on while you look at cards in Discover.
// Pure module. It counts a card's copies in the deck, adds and removes one
// copy at a time, keeps + at the copy limit, picks the cards to hide, and
// gives the filters that deck mode starts from. Issue #39 has the plan.

import { COLORS, SECTIONS } from "./config.js";
import { cardKey } from "./cards.js";
import { BRAWL_SIZE, MAX_COPIES, MIN_MAIN, checkDeck, copyLimit } from "./deck-rules.js";
import { addCard, defaultClock, isBrawlFormat, removeEntry, updateEntry } from "./lists.js";
import { normalizeCriteria } from "./query.js";

/**
 * @typedef {import("./lists.js").CardList} CardList
 * @typedef {import("./lists.js").Section} Section
 * @typedef {import("./cards.js").CardSnapshot} CardSnapshot
 * @typedef {Object} DeckMode The choice kept on one device, never in a backup.
 * @property {string} listId
 * @property {Section} section The section that + adds to.
 * @property {boolean} hide Hide cards that are already in the deck.
 */

const brawl = (list) => isBrawlFormat(list.format);

/** The sections that + can add to, in menu order. @returns {Section[]} */
export function addSections(list) {
  return brawl(list) ? ["main", "commander", "maybe"] : ["main", "sideboard", "maybe"];
}

/** The sections that the deck checks count for copies. */
function checkedSections(list) {
  return brawl(list) ? ["main", "commander"] : ["main", "sideboard"];
}

/**
 * Copies of a card in each section, for every printing of the card.
 * @param {CardList} list
 * @param {CardSnapshot} card
 * @returns {Record<Section, number>}
 */
export function deckCounts(list, card) {
  const key = cardKey(card);
  const counts = /** @type {Record<Section, number>} */ (Object.fromEntries(SECTIONS.map((s) => [s, 0])));
  for (const e of list.entries) if (cardKey(e.card) === key) counts[e.section] += e.quantity;
  return counts;
}

/**
 * The copy limit for a card in this deck, and how many copies count toward
 * it: the main deck and sideboard in Standard, and the main deck and
 * commander in Brawl. Maybe never counts.
 * @returns {{limit: number, count: number, atLimit: boolean}}
 */
export function copyRule(list, card) {
  const counts = deckCounts(list, card);
  const count = checkedSections(list).reduce((n, s) => n + counts[s], 0);
  const limit = card.isBasicLand ? Infinity : (copyLimit(card) ?? (brawl(list) ? 1 : MAX_COPIES));
  return { limit, count, atLimit: count >= limit };
}

/** True when + may add a copy to this section. */
export function canAddCopy(list, card, section) {
  return section === "maybe" || !copyRule(list, card).atLimit;
}

/**
 * Adds one copy to a section. At the copy limit, returns the same list.
 * @param {CardList} list
 * @param {CardSnapshot} card
 * @param {Section} section
 */
export function addCopy(list, card, section, clock = defaultClock) {
  if (!canAddCopy(list, card, section)) return list;
  return addCard(list, card, { quantity: 1, section }, clock);
}

/**
 * Takes one copy from a section: the same printing if the section has it,
 * else the last-added printing of the card. A last copy removes the entry,
 * and `removed` holds it and its place, for Undo with restoreEntry().
 * Returns null when the section has no copy.
 * @param {CardList} list
 * @param {CardSnapshot} card
 * @param {Section} section
 * @returns {{list: CardList, removed: {entry: import("./lists.js").Entry, index: number}|null}|null}
 */
export function removeCopy(list, card, section, clock = defaultClock) {
  const key = cardKey(card);
  const matches = list.entries.filter((e) => e.section === section && cardKey(e.card) === key);
  if (matches.length === 0) return null;
  const entry = matches.find((e) => e.card.scryfallId === card.scryfallId) ?? matches[matches.length - 1];
  if (entry.quantity > 1) return { list: updateEntry(list, entry.id, { quantity: entry.quantity - 1 }, clock), removed: null };
  const index = list.entries.indexOf(entry);
  return { list: removeEntry(list, entry.id, clock), removed: { entry, index } };
}

/** Color letters in the app's order, lowercase. @param {string[]} letters */
function colorSet(letters) {
  const set = new Set(letters.map((c) => c.toLowerCase()));
  return COLORS.filter((c) => set.has(c));
}

/**
 * The filters deck mode starts from: the current filters, with the deck's
 * format and colors. Brawl uses the commander's color identity. Standard
 * uses the colors of the cards in the main deck and sideboard. With no
 * colors to read, the color filter is cleared.
 * @param {CardList} list
 * @param {import("./query.js").Criteria} criteria
 * @returns {import("./query.js").Criteria}
 */
export function startingCriteria(list, criteria) {
  const isBrawl = brawl(list);
  const colorFree = { colorMode: "any", colors: [], colorless: false, useIdentity: isBrawl };
  let colors = { ...colorFree };
  if (isBrawl) {
    const commanders = list.entries.filter((e) => e.section === "commander");
    if (commanders.length > 0) {
      const identity = colorSet(commanders.flatMap((e) => e.card.colorIdentity ?? []));
      colors = identity.length > 0
        ? { ...colorFree, colorMode: "atMost", colors: identity }
        : { ...colorFree, colorless: true };
    }
  } else {
    const used = colorSet(list.entries
      .filter((e) => e.section === "main" || e.section === "sideboard")
      .flatMap((e) => e.card.colors ?? []));
    if (used.length > 0) colors = { ...colorFree, colorMode: "atMost", colors: used };
  }
  return normalizeCriteria({ ...criteria, format: list.format, ...colors });
}

/** True when the card is in the main deck, the commander section, or the sideboard. Maybe doesn't count. */
export function isInDeck(list, card) {
  const counts = deckCounts(list, card);
  return counts.main + counts.commander + counts.sideboard > 0;
}

/**
 * The cards to hide: those already in the deck, when hiding is on.
 * @param {CardList|null} list
 * @param {CardSnapshot[]} cards
 * @param {boolean} hide
 */
export function hiddenInDeck(list, cards, hide) {
  if (!list || !hide) return [];
  return cards.filter((c) => isInDeck(list, c));
}

/**
 * The numbers for the deck bar: the cards that count (with the commander
 * in Brawl), the deck size, and the problems that the deck checks find.
 * The size warning isn't a problem here, because the count shows it.
 * @param {CardList} list
 */
export function deckSummary(list) {
  const r = checkDeck(list);
  return {
    count: r.mainCount,
    size: brawl(list) ? BRAWL_SIZE[list.format] : MIN_MAIN,
    problems: r.results.filter((x) => x.code !== "mainSize").length,
  };
}

/**
 * Makes a valid deck mode choice from stored data, or null when there is
 * no choice or its list is gone or isn't a deck.
 * @param {any} value
 * @param {CardList[]} lists
 * @returns {DeckMode|null}
 */
export function cleanDeckMode(value, lists) {
  if (!value || typeof value !== "object" || typeof value.listId !== "string") return null;
  const list = lists.find((l) => l.id === value.listId);
  if (!list || list.kind !== "deck") return null;
  const section = addSections(list).includes(value.section) ? value.section : "main";
  return { listId: list.id, section, hide: value.hide === true };
}
