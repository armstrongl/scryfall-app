// Buying paper cards: the link for one card, the list to buy from a saved
// list, and bulk-entry links that open a store with the list filled in.
// Pure module.
//
// The bulk-entry links use the format of Commander Spellbook's own buy links:
// a `c` parameter with "quantity name" lines joined by "||". The links only
// fill the store's page. The store's own button adds the cards to the cart.

import { SECTIONS } from "./config.js";

/** TCGplayer Mass Entry. store.tcgplayer.com/massentry redirects here. */
export const TCGPLAYER_MASS_ENTRY = "https://www.tcgplayer.com/massentry";
/** TCGplayer's product search, the same link Commander Spellbook uses for one card. */
export const TCGPLAYER_SEARCH = "https://www.tcgplayer.com/search/magic/product";
/** Card Kingdom's Deck Builder. */
export const CARD_KINGDOM_BUILDER = "https://www.cardkingdom.com/builder";
/**
 * The longest bulk-entry link. A longer list gets more than one link. Both
 * stores filled every line from a 7,822-character link and failed at 10,692
 * (checked on 24 November 2026), so this keeps a margin.
 */
export const MAX_BUY_URL_LENGTH = 7500;
/** Sections in the list to buy unless the user changes them. */
export const BUY_SECTIONS = ["commander", "main", "sideboard"];

/**
 * @typedef {Object} BuyItem
 * @property {string} name The full card name, as the stores list it.
 * @property {number} quantity
 */

/** Formats that allow every paper card, and no card made only for digital play. */
const PAPER_FORMATS = ["vintage", "legacy", "commander"];

/**
 * True when the card exists in paper. `games` is for the saved printing
 * only, so a paper card saved from its Arena-only printing (such as a
 * Jumpstart: Historic Horizons reprint) has `games: ["arena"]`. Legality is
 * for the card, so any status other than "not_legal" in a paper format means
 * a paper printing exists. A card saved without this data counts as paper.
 */
function inPaper(card) {
  if (!Array.isArray(card.games) || card.games.includes("paper")) return true;
  if (!card.legalities) return false;
  return PAPER_FORMATS.some((f) => card.legalities[f] && card.legalities[f] !== "not_legal");
}

/** The non-foil USD price of the saved printing, as text, or null. */
function usdPrice(card) {
  return card.prices?.usd ?? null;
}

/**
 * The buy link for one card: Scryfall's TCGplayer link for the saved
 * printing, and its price. When that printing has no link but the card is in
 * paper, a TCGplayer search for the card's front face, with no price. Null
 * for a card with no paper printing.
 * @param {import("./cards.js").CardSnapshot} card
 * @returns {{url: string, price: string|null}|null}
 */
export function cardBuyLink(card) {
  if (!inPaper(card)) return null;
  const url = card.purchaseUris?.tcgplayer;
  if (url) return { url, price: usdPrice(card) };
  const q = encodeURIComponent(card.frontName ?? card.name);
  return { url: `${TCGPLAYER_SEARCH}?productLineName=magic&q=${q}`, price: null };
}

/**
 * The cards to buy from list entries, one line per card name.
 * @param {import("./lists.js").Entry[]} entries
 * @param {{sections?: string[], basics?: boolean}} [opts]
 * @returns {{items: BuyItem[], count: number, totalCents: number, priced: number, unpriced: string[], noPaper: string[], basics: number, oldData: number}}
 */
export function buyList(entries, opts = {}) {
  const sections = opts.sections ?? BUY_SECTIONS;
  const byName = new Map();
  const unpriced = new Set();
  const priced = new Set();
  const noPaper = new Set();
  let totalCents = 0;
  let basics = 0;
  let oldData = 0;
  // Lines follow the section order: commander, main deck, sideboard, maybe.
  const ordered = SECTIONS.flatMap((s) => entries.filter((e) => e.section === s));
  for (const e of ordered) {
    if (!sections.includes(e.section)) continue;
    const card = e.card;
    if (card.isBasicLand && !opts.basics) {
      basics += e.quantity;
      continue;
    }
    if (!inPaper(card)) {
      noPaper.add(card.name);
      continue;
    }
    const price = usdPrice(card);
    if (card.prices === undefined) oldData += 1;
    else if (price === null) unpriced.add(card.name);
    else {
      totalCents += Math.round(Number(price) * 100) * e.quantity;
      priced.add(card.name);
    }
    const item = byName.get(card.name);
    if (item) item.quantity += e.quantity;
    else byName.set(card.name, { name: card.name, quantity: e.quantity });
  }
  const items = [...byName.values()];
  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    totalCents,
    priced: priced.size,
    unpriced: [...unpriced],
    noPaper: [...noPaper],
    basics,
    oldData,
  };
}

/** @param {BuyItem[]} items */
export function buyText(items) {
  return items.map((i) => `${i.quantity} ${i.name}`).join("\n");
}

/** Dollars and cents, for example $1,234.56. */
export function formatUsd(cents) {
  const [dollars, rest] = (cents / 100).toFixed(2).split(".");
  return `$${dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${rest}`;
}

/** Bulk-entry links for a store, each at most MAX_BUY_URL_LENGTH long. */
function bulkUrls(base, items) {
  const make = (lines) => `${base}?c=${encodeURIComponent(lines.join("||"))}`;
  const urls = [];
  let lines = [];
  for (const item of items) {
    const line = `${item.quantity} ${item.name}`;
    if (lines.length && make([...lines, line]).length > MAX_BUY_URL_LENGTH) {
      urls.push(make(lines));
      lines = [];
    }
    lines.push(line);
  }
  if (lines.length) urls.push(make(lines));
  return urls;
}

/** @param {BuyItem[]} items */
export const tcgplayerUrls = (items) => bulkUrls(TCGPLAYER_MASS_ENTRY, items);
/** @param {BuyItem[]} items */
export const cardKingdomUrls = (items) => bulkUrls(CARD_KINGDOM_BUILDER, items);
