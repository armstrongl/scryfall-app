// Buying paper cards: the link for one card, the list to buy from a saved
// list, and bulk-entry links that open a store with the list filled in.
// Pure module.
//
// The bulk-entry links use the format of Commander Spellbook's own buy links:
// a `c` parameter with "quantity name" lines joined by "||". The links only
// fill the store's page. The store's own button adds the cards to the cart.

/** TCGplayer Mass Entry. store.tcgplayer.com/massentry redirects here. */
export const TCGPLAYER_MASS_ENTRY = "https://www.tcgplayer.com/massentry";
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

/** False only when Scryfall says the card has no paper printing. */
function inPaper(card) {
  return !Array.isArray(card.games) || card.games.includes("paper");
}

/** The USD price of one copy as text, the foil price when that's all there is, or null. */
function usdPrice(card) {
  return card.prices?.usd ?? card.prices?.usdFoil ?? null;
}

/**
 * The buy link for one card: Scryfall's TCGplayer link, and its price.
 * Null when the card has no paper printing or no saved link.
 * @param {import("./cards.js").CardSnapshot} card
 * @returns {{url: string, price: string|null}|null}
 */
export function cardBuyLink(card) {
  const url = card.purchaseUris?.tcgplayer;
  if (!url || !inPaper(card)) return null;
  return { url, price: usdPrice(card) };
}

/**
 * The cards to buy from list entries, one line per card name.
 * @param {import("./lists.js").Entry[]} entries
 * @param {{sections?: string[], basics?: boolean}} [opts]
 * @returns {{items: BuyItem[], count: number, totalCents: number, unpriced: string[], noPaper: string[], basics: number, oldData: number}}
 */
export function buyList(entries, opts = {}) {
  const sections = opts.sections ?? BUY_SECTIONS;
  const byName = new Map();
  const unpriced = new Set();
  const noPaper = new Set();
  let totalCents = 0;
  let basics = 0;
  let oldData = 0;
  for (const e of entries) {
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
    if (card.prices === undefined) oldData += 1;
    const price = usdPrice(card);
    if (price === null) unpriced.add(card.name);
    else totalCents += Math.round(Number(price) * 100) * e.quantity;
    const item = byName.get(card.name);
    if (item) item.quantity += e.quantity;
    else byName.set(card.name, { name: card.name, quantity: e.quantity });
  }
  const items = [...byName.values()];
  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    totalCents,
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
