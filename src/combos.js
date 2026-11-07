// Combos: links to Commander Spellbook. Pure module.
//
// Commander Spellbook (https://commanderspellbook.com) is a database of card
// combos. Its API only answers web pages on its own site, so the app can't
// load combos itself. It links to searches on their site instead, and copies
// a list in the format their Find My Combos page reads.
//
// Checked on commanderspellbook.com on 2026-11-07:
// - card="Name" finds combos that use a card with exactly that name. Their
//   names match Scryfall's full names, such as "Delver of Secrets // Insectile
//   Aberration".
// - legal:<format> keeps combos legal in a format. Without it, their site
//   keeps Commander-legal combos, so every search here names a format.
// - coloridentity<=<colors> keeps combos within those colors ("c" for
//   colorless).
// - Their decklist box reads "1 Card Name" lines, with commanders after a
//   "// Commanders" line, as their own site writes it.
//
// Labels and reasons are plain words. The search terms appear only in URLs.

import { FORMAT_NAMES, SPELLBOOK_SITE } from "./config.js";
import { isBrawlFormat } from "./lists.js";

/** Commander Spellbook's names for the formats it tracks, by Scryfall legality key. */
export const SPELLBOOK_FORMATS = Object.freeze({
  standard: "standard",
  standardbrawl: "standard_brawl",
  brawl: "brawl",
  competitivebrawl: "competitive_brawl",
  alchemy: "alchemy",
  pioneer: "pioneer",
  modern: "modern",
  legacy: "legacy",
  vintage: "vintage",
  pauper: "pauper",
  premodern: "premodern",
  commander: "commander",
  oathbreaker: "oathbreaker",
  predh: "predh",
  paupercommander: "pauper_commander",
});

export const FIND_MY_COMBOS_URL = `${SPELLBOOK_SITE}/find-my-combos/`;

/**
 * @typedef {Object} ComboSearch
 * @property {"card"|"identity"} id
 * @property {string} label What the search finds, in plain words.
 * @property {string} reason More about it, in plain words.
 * @property {string} url A search on commanderspellbook.com.
 */

/**
 * Commander Spellbook's name for a format, or null if it doesn't track it.
 * @param {string|null|undefined} format A Scryfall legality key.
 */
export function spellbookFormat(format) {
  return format && Object.hasOwn(SPELLBOOK_FORMATS, format) ? SPELLBOOK_FORMATS[format] : null;
}

/** A search URL on commanderspellbook.com. Popularity is their default order. */
export function spellbookSearchUrl(query) {
  return `${SPELLBOOK_SITE}/search/?${new URLSearchParams({ q: query }).toString()}`;
}

const formatName = (format) => FORMAT_NAMES[format] ?? format;

/** The format term and a plain-words note about it. */
function legality(format) {
  const tracked = spellbookFormat(format);
  if (tracked) return { term: `legal:${tracked}`, note: `Legal in ${formatName(format)}.` };
  const note = format
    ? `Commander Spellbook doesn't track ${formatName(format)}, so this shows combos legal in Commander.`
    : "Legal in Commander.";
  return { term: "legal:commander", note };
}

const quoted = (name) => `"${name.replace(/"/g, '\\"')}"`;

/**
 * Combos that use this card.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @param {string|null} format
 * @returns {ComboSearch}
 */
export function cardComboSearch(snapshot, format) {
  const { term, note } = legality(format);
  return {
    id: "card",
    label: `Combos with ${snapshot.name}`,
    reason: `${note} Most popular first.`,
    url: spellbookSearchUrl(`card=${quoted(snapshot.name)} ${term}`),
  };
}

/**
 * Combos within this card's color identity, for a deck it leads.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @param {string|null} format
 * @returns {ComboSearch}
 */
export function identityComboSearch(snapshot, format) {
  const { term, note } = legality(format);
  const colors = (snapshot.colorIdentity ?? []).join("").toLowerCase() || "c";
  return {
    id: "identity",
    label: `Combos in ${snapshot.name}'s colors`,
    reason: `For a deck with ${snapshot.name} as your commander. ${note} Most popular first.`,
    url: spellbookSearchUrl(`coloridentity<=${colors} ${term}`),
  };
}

/**
 * True for a legendary creature or planeswalker, which can lead a Brawl deck.
 * Reads the front face only.
 * @param {import("./cards.js").CardSnapshot} snapshot
 */
export function canLeadDeck(snapshot) {
  const front = (snapshot.typeLine ?? "").split(" // ")[0];
  return /\bLegendary\b/.test(front) && /\b(Creature|Planeswalker)\b/.test(front);
}

/**
 * The searches for the Combos tab in Explore.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @param {string|null} format The format of the current search.
 * @returns {ComboSearch[]}
 */
export function exploreCombos(snapshot, format) {
  const out = [cardComboSearch(snapshot, format)];
  if (canLeadDeck(snapshot)) out.push(identityComboSearch(snapshot, format));
  return out;
}

/**
 * A list as text for Commander Spellbook's Find My Combos page. The maybe
 * section is left out. Commanders of Brawl decks come after a
 * "// Commanders" line. Full card names, so double-faced cards match.
 * @param {import("./lists.js").CardList} list
 */
export function findMyCombosText(list) {
  const brawl = list.kind === "deck" && isBrawlFormat(list.format);
  const line = (e) => `${e.quantity} ${e.card.name}`;
  const commanders = brawl ? list.entries.filter((e) => e.section === "commander") : [];
  const main = list.entries.filter((e) => e.section !== "maybe" && !commanders.includes(e));
  const out = main.map(line);
  if (commanders.length) out.push("// Commanders", ...commanders.map(line));
  return out.join("\n");
}

/**
 * Everything the Find combos panel of a list needs.
 * @param {import("./lists.js").CardList} list
 * @param {string|null} currentFormat The format of the current search, for collections.
 */
export function listCombos(list, currentFormat) {
  const format = list.kind === "deck" ? list.format : currentFormat;
  const brawl = list.kind === "deck" && isBrawlFormat(list.format);
  const commanders = brawl ? list.entries.filter((e) => e.section === "commander").map((e) => e.card) : [];
  return {
    text: findMyCombosText(list),
    formatName: spellbookFormat(format) ? formatName(format) : "Commander",
    searches: commanders.flatMap((c) => [cardComboSearch(c, format), identityComboSearch(c, format)]),
  };
}
