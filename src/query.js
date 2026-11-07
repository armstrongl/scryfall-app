// Turns a Criteria object into a Scryfall query string. Pure module.

import { CARD_TYPES, COLORS, COLOR_NAMES, FORMAT_KEYS, FORMAT_NAMES, MAX_QUERY_LENGTH, RARITIES } from "./config.js";

/**
 * @typedef {Object} Criteria
 * @property {string|null} format A legality key, or null for any format.
 * @property {"arena"|"mtgo"|"paper"|null} game
 * @property {boolean} excludeRebalanced
 * @property {"any"|"exactly"|"atLeast"|"atMost"} colorMode
 * @property {("w"|"u"|"b"|"r"|"g")[]} colors
 * @property {boolean} colorless
 * @property {boolean} useIdentity Filter by color identity (id) instead of color (c), for Commander and Brawl.
 * @property {string[]} types
 * @property {string} typeText
 * @property {number|null} mvMin
 * @property {number|null} mvMax
 * @property {("common"|"uncommon"|"rare"|"mythic")[]} rarities
 * @property {string} keyword
 * @property {string} oracleText
 * @property {string} rawQuery Scryfall search syntax.
 * @property {string} rawLabel A readable name for rawQuery, for example the
 *   Explore search it came from. Shown on its chip instead of the syntax.
 */

/** @returns {Criteria} */
export function defaultCriteria() {
  return {
    format: "standard",
    game: "arena",
    excludeRebalanced: true,
    colorMode: "any",
    colors: [],
    colorless: false,
    useIdentity: false,
    types: [],
    typeText: "",
    mvMin: null,
    mvMax: null,
    rarities: [],
    keyword: "",
    oracleText: "",
    rawQuery: "",
    rawLabel: "",
  };
}

/** @returns {Criteria} Criteria with no filters at all. */
export function emptyCriteria() {
  return { ...defaultCriteria(), format: null, game: null, excludeRebalanced: false };
}

const GAMES = ["arena", "mtgo", "paper"];
const COLOR_MODES = ["any", "exactly", "atLeast", "atMost"];
const OPERATORS = { exactly: "=", atLeast: ">=", atMost: "<=" };

function toWholeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Makes a valid Criteria object from any input, for example stored data or an
 * imported backup. Unknown or wrong values fall back to the default.
 * @param {any} input
 * @returns {Criteria}
 */
export function normalizeCriteria(input) {
  const d = defaultCriteria();
  if (!input || typeof input !== "object") return d;
  const str = (v) => (typeof v === "string" ? v : "");
  const pick = (list, allowed) =>
    Array.isArray(list) ? allowed.filter((x) => list.includes(x)) : [];
  return {
    format: input.format === null || FORMAT_KEYS.includes(input.format) ? input.format : d.format,
    game: input.game === null || GAMES.includes(input.game) ? input.game : d.game,
    excludeRebalanced:
      typeof input.excludeRebalanced === "boolean" ? input.excludeRebalanced : d.excludeRebalanced,
    colorMode: COLOR_MODES.includes(input.colorMode) ? input.colorMode : d.colorMode,
    colors: pick(input.colors, COLORS),
    colorless: input.colorless === true,
    useIdentity: input.useIdentity === true,
    types: pick(input.types, CARD_TYPES),
    typeText: str(input.typeText),
    mvMin: toWholeNumber(input.mvMin),
    mvMax: toWholeNumber(input.mvMax),
    rarities: pick(input.rarities, RARITIES),
    keyword: str(input.keyword),
    oracleText: str(input.oracleText),
    rawQuery: str(input.rawQuery),
    rawLabel: str(input.rawLabel),
  };
}

/**
 * Makes a term for free text. Returns null for empty text. Text with a space
 * or a character that has meaning in Scryfall syntax is quoted.
 * @param {string} prefix For example "t" or "kw".
 * @param {string} text
 * @param {boolean} [alwaysQuote]
 */
function textTerm(prefix, text, alwaysQuote = false) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const needsQuotes = alwaysQuote || /[\s():<>=!]/.test(t);
  return needsQuotes ? `${prefix}:"${t}"` : `${prefix}:${t}`;
}

function orGroup(terms) {
  if (terms.length === 0) return null;
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" or ")})`;
}

/** Counts Unicode code points, which is how Scryfall measures the limit. */
export function queryLength(query) {
  return [...query].length;
}

/**
 * @typedef {Object} BuildResult
 * @property {string} query The full query string.
 * @property {{field: string, message: string}[]} hints Parts that were not used, and why.
 * @property {string|null} error A reason the query must not be sent, or null.
 */

/**
 * Builds the query string. Parts are joined in the fixed order of the
 * criteria table in PLAN.md section 4.1.
 * @param {Criteria} input
 * @returns {BuildResult}
 */
export function buildQuery(input) {
  const c = normalizeCriteria(input);
  const parts = [];
  const hints = [];

  const freeText = (field, label, make) => {
    const value = c[field];
    if (value.includes('"')) {
      hints.push({
        field,
        message: `${label} can't contain a double quote ("). Use the Scryfall search field for this term.`,
      });
      return;
    }
    const term = make(value);
    if (term) parts.push(term);
  };

  if (c.format) parts.push(`f:${c.format}`);
  if (c.game) parts.push(`game:${c.game}`);
  if (c.excludeRebalanced) parts.push("-is:rebalanced");

  const colorKey = c.useIdentity ? "id" : "c";
  if (c.colorless) {
    parts.push(`${colorKey}=c`);
  } else if (c.colorMode !== "any" && c.colors.length > 0) {
    const letters = COLORS.filter((x) => c.colors.includes(x)).join("");
    parts.push(`${colorKey}${OPERATORS[c.colorMode]}${letters}`);
  } else if (c.colorMode !== "any" && c.colors.length === 0) {
    hints.push({ field: "colors", message: "Choose at least one color, or set the color mode to Any." });
  } else if (c.colorMode === "any" && c.colors.length > 0) {
    hints.push({ field: "colors", message: "Choose a color mode to filter by these colors." });
  }

  const types = orGroup(CARD_TYPES.filter((t) => c.types.includes(t)).map((t) => `t:${t}`));
  if (types) parts.push(types);

  freeText("typeText", "Type line text", (v) => textTerm("t", v));

  if (c.mvMin !== null && c.mvMax !== null && c.mvMin === c.mvMax) {
    parts.push(`mv=${c.mvMin}`);
  } else {
    if (c.mvMin !== null) parts.push(`mv>=${c.mvMin}`);
    if (c.mvMax !== null) parts.push(`mv<=${c.mvMax}`);
    if (c.mvMin !== null && c.mvMax !== null && c.mvMin > c.mvMax) {
      hints.push({ field: "mv", message: "The minimum mana value is more than the maximum, so no cards match." });
    }
  }

  const rarities = orGroup(RARITIES.filter((r) => c.rarities.includes(r)).map((r) => `r:${r}`));
  if (rarities) parts.push(rarities);

  freeText("keyword", "Keyword ability", (v) => textTerm("kw", v));
  freeText("oracleText", "Rules text", (v) => textTerm("o", v, true));

  const raw = c.rawQuery.trim();
  if (raw) parts.push(`(${raw})`);

  const query = parts.join(" ");
  let error = null;
  const length = queryLength(query);
  if (length > MAX_QUERY_LENGTH) {
    error = `The query has ${length} characters. Scryfall accepts at most ${MAX_QUERY_LENGTH}. Remove some criteria and try again.`;
  }
  return { query, hints, error };
}

const GAME_LABELS = { arena: "On Arena", mtgo: "On MTGO", paper: "In paper" };
const MODE_LABELS = { exactly: "Exactly", atLeast: "At least", atMost: "At most" };

function joinOr(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}
function joinAnd(words) {
  if (words.length <= 1) return words.join("");
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const short = (s, n = 40) => ([...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);

/**
 * One chip for each active filter, in query order. `clear` is the change
 * to the criteria that removes the filter.
 * @param {Criteria} input
 * @returns {{id: string, label: string, clear: Partial<Criteria>}[]}
 */
export function filterChips(input) {
  const c = normalizeCriteria(input);
  const chips = [];
  if (c.format) chips.push({ id: "format", label: FORMAT_NAMES[c.format] ?? c.format, clear: { format: null } });
  if (c.game) chips.push({ id: "game", label: GAME_LABELS[c.game], clear: { game: null } });
  if (c.excludeRebalanced) chips.push({ id: "excludeRebalanced", label: "No rebalanced cards", clear: { excludeRebalanced: false } });
  const prefix = c.useIdentity ? "Color identity " : "";
  if (c.colorless) {
    chips.push({ id: "colors", label: `${prefix}colorless`.replace(/^c/, "C"), clear: { colorless: false } });
  } else if (c.colorMode !== "any" && c.colors.length > 0) {
    const names = COLORS.filter((x) => c.colors.includes(x)).map((x) => COLOR_NAMES[x].toLowerCase());
    const mode = MODE_LABELS[c.colorMode];
    chips.push({ id: "colors", label: cap(`${prefix}${prefix ? mode.toLowerCase() : mode} ${joinAnd(names)}`), clear: { colors: [], colorMode: "any" } });
  }
  if (c.types.length) chips.push({ id: "types", label: cap(joinOr(CARD_TYPES.filter((t) => c.types.includes(t)))), clear: { types: [] } });
  if (c.typeText.trim()) chips.push({ id: "typeText", label: `Type: ${short(c.typeText.trim())}`, clear: { typeText: "" } });
  if (c.mvMin !== null || c.mvMax !== null) {
    const label = c.mvMin !== null && c.mvMax !== null
      ? (c.mvMin === c.mvMax ? `Mana value ${c.mvMin}` : `Mana value ${c.mvMin} to ${c.mvMax}`)
      : c.mvMin !== null ? `Mana value ${c.mvMin} or more` : `Mana value ${c.mvMax} or less`;
    chips.push({ id: "mv", label, clear: { mvMin: null, mvMax: null } });
  }
  if (c.rarities.length) chips.push({ id: "rarities", label: cap(joinOr(RARITIES.filter((r) => c.rarities.includes(r)))), clear: { rarities: [] } });
  if (c.keyword.trim()) chips.push({ id: "keyword", label: `Keyword: ${short(c.keyword.trim())}`, clear: { keyword: "" } });
  if (c.oracleText.trim()) chips.push({ id: "oracleText", label: `Text: ${short(c.oracleText.trim())}`, clear: { oracleText: "" } });
  if (c.rawQuery.trim()) {
    const label = c.rawLabel.trim() || `Custom search: ${short(c.rawQuery.trim())}`;
    chips.push({ id: "rawQuery", label, clear: { rawQuery: "", rawLabel: "" } });
  }
  return chips;
}

/** @param {string} query */
export function scryfallSearchUrl(query) {
  return `https://scryfall.com/search?q=${encodeURIComponent(query)}`;
}
