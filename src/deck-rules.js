// Standard deck checks. Pure module. The checks give information and never
// block an edit. Rules: https://wpn.wizards.com/en/formats

import { cardKey, legalityName } from "./cards.js";

export const MIN_MAIN = 60;
export const MAX_SIDEBOARD = 15;
export const MAX_COPIES = 4;

/**
 * @typedef {Object} CheckResult
 * @property {"warning"|"error"} level
 * @property {"mainSize"|"sideboardSize"|"copies"|"legality"} code
 * @property {string} message
 * @property {string} [card] The card name, for card checks.
 */

/**
 * @param {import("./lists.js").CardList} list
 * @returns {{results: CheckResult[], mainCount: number, sideboardCount: number, legalityAsOf: string|null}}
 */
export function checkDeck(list) {
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

  /** @type {Map<string, {name: string, count: number, basic: boolean}>} */
  const copies = new Map();
  for (const e of counted) {
    const key = cardKey(e.card);
    const item = copies.get(key) ?? { name: e.card.name, count: 0, basic: e.card.isBasicLand };
    item.count += e.quantity;
    copies.set(key, item);
  }
  for (const item of copies.values()) {
    if (!item.basic && item.count > MAX_COPIES) {
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
    if (e.card.standardLegality !== "legal" && !reported.has(key)) {
      reported.add(key);
      results.push({
        level: "error",
        code: "legality",
        card: e.card.name,
        message: `${e.card.name} is ${legalityName(e.card.standardLegality)} in Standard.`,
      });
    }
  }

  const dates = counted.map((e) => e.card.fetchedAt).filter(Boolean).sort();
  return { results, mainCount, sideboardCount, legalityAsOf: dates[0] ?? null };
}
