// Deck checks for Standard and the Brawl formats. Pure module. The checks
// give information and never block an edit.
// Standard rules: https://magic.wizards.com/en/formats/standard
// Brawl rules: https://magic.wizards.com/en/formats/brawl

import { DECK_FORMAT_NAMES } from "./config.js";
import { cardKey, legalityName } from "./cards.js";
import { isBrawlFormat } from "./lists.js";

export const MIN_MAIN = 60;
export const MAX_SIDEBOARD = 15;
export const MAX_COPIES = 4;
/** Brawl deck sizes, counting the commander. */
export const BRAWL_SIZE = { brawl: 100, standardbrawl: 60 };

/**
 * @typedef {Object} CheckResult
 * @property {"warning"|"error"} level
 * @property {"mainSize"|"sideboardSize"|"copies"|"legality"|"legalityUnknown"|"singleton"|"identity"|"commander"|"sideboard"} code
 * @property {string} message
 * @property {string} [card] The card name, for card checks.
 */

/**
 * @param {import("./lists.js").CardList} list
 * @returns {{results: CheckResult[], mainCount: number, sideboardCount: number, legalityAsOf: string|null}}
 */
export function checkDeck(list) {
  return isBrawlFormat(list.format) ? checkBrawl(list) : checkStandard(list);
}

/** The legality of a card in a format, from its snapshot. */
function legalityIn(card, format) {
  if (format === "standard" && card.standardLegality) return card.standardLegality;
  return card.legalities?.[format] ?? null;
}

function oldestFetch(entries) {
  return entries.map((e) => e.card.fetchedAt).filter(Boolean).sort()[0] ?? null;
}

/** Text of a card that allows any number of copies, such as Relentless Rats. */
function anyNumberAllowed(card) {
  return /\bA deck can have any number of cards named\b/i.test(card.oracleText ?? "");
}

function checkStandard(list) {
  const counted = list.entries.filter((e) => e.section === "main" || e.section === "sideboard");
  const sum = (section) =>
    counted.filter((e) => e.section === section).reduce((n, e) => n + e.quantity, 0);
  const mainCount = sum("main");
  const sideboardCount = sum("sideboard");
  /** @type {CheckResult[]} */
  const results = [];

  if (mainCount < MIN_MAIN) {
    const needed = MIN_MAIN - mainCount;
    results.push({
      level: "warning",
      code: "mainSize",
      message: `The main deck has ${mainCount} cards. Add ${needed} more to reach ${MIN_MAIN}.`,
    });
  }
  if (sideboardCount > MAX_SIDEBOARD) {
    results.push({
      level: "error",
      code: "sideboardSize",
      message: `The sideboard has ${sideboardCount} cards. Remove ${sideboardCount - MAX_SIDEBOARD} to get to ${MAX_SIDEBOARD}.`,
    });
  }

  /** @type {Map<string, {name: string, count: number, basic: boolean, any: boolean}>} */
  const copies = new Map();
  for (const e of counted) {
    const key = cardKey(e.card);
    const item = copies.get(key) ?? { name: e.card.name, count: 0, basic: e.card.isBasicLand, any: anyNumberAllowed(e.card) };
    item.count += e.quantity;
    copies.set(key, item);
  }
  for (const item of copies.values()) {
    if (!item.basic && !item.any && item.count > MAX_COPIES) {
      results.push({
        level: "error",
        code: "copies",
        card: item.name,
        message: `${item.name}: ${item.count} copies. A deck can have at most ${MAX_COPIES}.`,
      });
    }
  }

  const reported = new Set();
  for (const e of counted) {
    const key = cardKey(e.card);
    const status = legalityIn(e.card, "standard");
    if (status !== "legal" && !reported.has(key)) {
      reported.add(key);
      results.push({
        level: "error",
        code: "legality",
        card: e.card.name,
        message: `${e.card.name} is ${legalityName(status ?? "unknown")} in Standard.`,
      });
    }
  }

  return { results, mainCount, sideboardCount, legalityAsOf: oldestFetch(counted) };
}

/** A legendary creature or planeswalker, or a card that says it can be a commander. */
function canBeCommander(card) {
  const front = (card.typeLine ?? "").split(" // ")[0];
  const legendary = /\bLegendary\b/.test(front) && /\b(?:Creature|Planeswalker)\b/.test(front);
  return legendary || /\bcan be your commander\b/i.test(card.oracleText ?? "");
}

function checkBrawl(list) {
  const format = list.format;
  const formatName = DECK_FORMAT_NAMES[format] ?? format;
  const size = BRAWL_SIZE[format];
  const commanders = list.entries.filter((e) => e.section === "commander");
  const deck = list.entries.filter((e) => e.section === "main" || e.section === "commander");
  const sideboard = list.entries.filter((e) => e.section === "sideboard");
  const mainCount = deck.reduce((n, e) => n + e.quantity, 0);
  const sideboardCount = sideboard.reduce((n, e) => n + e.quantity, 0);
  /** @type {CheckResult[]} */
  const results = [];

  // Commander.
  const commanderCount = commanders.reduce((n, e) => n + e.quantity, 0);
  if (commanderCount === 0) {
    results.push({ level: "warning", code: "commander", message: "Choose a commander. Move a legendary creature or planeswalker to the Commander section." });
  } else if (commanderCount > 1) {
    results.push({ level: "error", code: "commander", message: `The Commander section has ${commanderCount} cards. A ${formatName} deck has 1 commander.` });
  }
  for (const e of commanders) {
    if (!canBeCommander(e.card)) {
      results.push({ level: "error", code: "commander", card: e.card.name, message: `${e.card.name} can't be a commander. A commander must be a legendary creature or planeswalker.` });
    }
  }

  // Size.
  if (mainCount < size) {
    results.push({ level: "warning", code: "mainSize", message: `The deck has ${mainCount} cards, counting the commander. Add ${size - mainCount} more to reach ${size}.` });
  } else if (mainCount > size) {
    results.push({ level: "error", code: "mainSize", message: `The deck has ${mainCount} cards, counting the commander. Remove ${mainCount - size} to get to ${size}.` });
  }

  // Singleton.
  /** @type {Map<string, {name: string, count: number, exempt: boolean}>} */
  const copies = new Map();
  for (const e of deck) {
    const key = cardKey(e.card);
    const item = copies.get(key) ?? { name: e.card.name, count: 0, exempt: e.card.isBasicLand || anyNumberAllowed(e.card) };
    item.count += e.quantity;
    copies.set(key, item);
  }
  for (const item of copies.values()) {
    if (!item.exempt && item.count > 1) {
      results.push({ level: "error", code: "singleton", card: item.name, message: `${item.name}: ${item.count} copies. A ${formatName} deck can have 1 copy of each card except basic lands.` });
    }
  }

  // Color identity.
  if (commanders.length > 0) {
    const identity = new Set(commanders.flatMap((e) => e.card.colorIdentity ?? []));
    const reported = new Set();
    for (const e of deck) {
      if (e.section === "commander") continue;
      const outside = (e.card.colorIdentity ?? []).filter((c) => !identity.has(c));
      const key = cardKey(e.card);
      if (outside.length && !reported.has(key)) {
        reported.add(key);
        results.push({ level: "error", code: "identity", card: e.card.name, message: `${e.card.name} has colors outside the commander's color identity.` });
      }
    }
  }

  // Legality.
  const reported = new Set();
  let unknown = 0;
  for (const e of deck) {
    const key = cardKey(e.card);
    if (reported.has(key)) continue;
    reported.add(key);
    const status = legalityIn(e.card, format);
    if (status === null) unknown += 1;
    else if (status !== "legal") {
      results.push({ level: "error", code: "legality", card: e.card.name, message: `${e.card.name} is ${legalityName(status)} in ${formatName}.` });
    }
  }
  if (unknown > 0) {
    results.push({ level: "warning", code: "legalityUnknown", message: `${unknown === 1 ? "1 card was" : `${unknown} cards were`} saved before the app kept ${formatName} legality. Select Refresh card data to check ${unknown === 1 ? "it" : "them"}.` });
  }

  if (sideboardCount > 0) {
    results.push({ level: "warning", code: "sideboard", message: `${formatName} decks have no sideboard. The ${sideboardCount} sideboard ${sideboardCount === 1 ? "card isn't" : "cards aren't"} exported.` });
  }

  return { results, mainCount, sideboardCount, legalityAsOf: oldestFetch(deck) };
}
