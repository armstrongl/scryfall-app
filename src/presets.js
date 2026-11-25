// The built-in presets, and which preset matches the current filters. Pure module.

import { NEWEST_SET_PRESET_ID, defaultCriteria, emptyCriteria, normalizeCriteria } from "./query.js";

/** @typedef {import("./export.js").Preset} Preset */

export const DEFAULT_PRESET_ID = "builtin-arena-standard";

const STAMP = "2026-01-01T00:00:00.000Z";

/** @param {string} id @param {string} name @param {Partial<import("./query.js").Criteria>} criteria */
const preset = (id, name, criteria) =>
  Object.freeze({ id, name, builtIn: true, criteria: Object.freeze(normalizeCriteria(criteria)), createdAt: STAMP, updatedAt: STAMP });

/** Lands that aren't basic lands. Scryfall's type search has no "not", so this is a search with a plain label. */
const NOT_BASIC = { types: ["land"], rawQuery: "-t:basic", rawLabel: "Not basic lands" };

const arenaStandard = defaultCriteria();
/**
 * Arena's 100-card Brawl, with colors read as color identity. On 2026-11-05
 * the API listed no rebalanced card as legal in Brawl (is:rebalanced
 * f:brawl found nothing), so leaving them out changes nothing.
 */
const arenaBrawl = { ...defaultCriteria(), format: "brawl", useIdentity: true };
/**
 * Commander is played in paper and on MTGO, so these presets name no game.
 * Without a game, the paper price applies.
 */
const commander = { ...emptyCriteria(), format: "commander", useIdentity: true };

/** The built-in presets, in the order the Preset list shows them. */
export const BUILT_IN_PRESETS = Object.freeze([
  preset(DEFAULT_PRESET_ID, "Arena Standard", arenaStandard),
  preset("builtin-arena-standard-lands", "Arena Standard: non-basic lands", { ...arenaStandard, ...NOT_BASIC }),
  preset("builtin-arena-brawl", "Arena Brawl", arenaBrawl),
  preset("builtin-arena-brawl-lands", "Arena Brawl: non-basic lands", { ...arenaBrawl, ...NOT_BASIC }),
  preset("builtin-commander", "Commander", commander),
  preset("builtin-commander-budget", "Commander: under $2 a card", { ...commander, priceMax: 2 }),
  preset("builtin-commander-staples", "Commander: staples", { ...commander, popularity: "staple" }),
  preset("builtin-commanders", "Commander: commanders", { ...commander, canBeCommander: true }),
  preset("builtin-commander-lands", "Commander: non-basic lands", { ...commander, ...NOT_BASIC }),
  // Colorless identity fits in any deck. Lands have their own preset.
  preset("builtin-commander-colorless", "Commander: colorless cards", { ...commander, colorless: true, rawQuery: "-t:land", rawLabel: "Not lands" }),
]);

/** The preset the Newest Standard set preset follows in the list. */
const NEWEST_AFTER = "builtin-arena-standard-lands";

/**
 * The built-in presets in list order, with the Newest Standard set preset
 * after the Arena Standard presets once it is known.
 * @param {Preset|null} newest
 * @returns {Preset[]}
 */
export function builtInPresets(newest) {
  const list = [...BUILT_IN_PRESETS];
  if (newest && newest.id === NEWEST_SET_PRESET_ID) list.splice(list.findIndex((p) => p.id === NEWEST_AFTER) + 1, 0, newest);
  return list;
}

const key = (criteria) => JSON.stringify(normalizeCriteria(criteria));

/**
 * The first preset whose filters are exactly these filters, or null.
 * @param {any} criteria
 * @param {Preset[]} presets
 * @returns {Preset|null}
 */
export function matchingPreset(criteria, presets) {
  const k = key(criteria);
  return presets.find((p) => key(p.criteria) === k) ?? null;
}
