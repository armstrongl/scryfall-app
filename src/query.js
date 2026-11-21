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
 * @property {"staple"|"popular"|"spicy"|null} popularity By EDHREC rank.
 * @property {number|null} yearMin First printed in this year or later.
 * @property {number|null} yearMax First printed in this year or earlier.
 * @property {{code: string, name: string}[]} sets Printed in any of these sets.
 * @property {"none"|"keywords"|"1"|"2"|"3plus"|null} abilityCount Paragraphs of rules text.
 * @property {string[]} creatureKeywords Keywords from CREATURE_KEYWORDS; a card must have all of them.
 * @property {number|null} powMin
 * @property {number|null} powMax
 * @property {number|null} touMin
 * @property {number|null} touMax
 * @property {string[]} roles Tagger tags from CARD_ROLES; a card needs any of them.
 * @property {boolean} canBeCommander
 * @property {number|null} priceMax Paper price in USD.
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
    popularity: null,
    yearMin: null,
    yearMax: null,
    sets: [],
    abilityCount: null,
    creatureKeywords: [],
    powMin: null,
    powMax: null,
    touMin: null,
    touMax: null,
    roles: [],
    canBeCommander: false,
    priceMax: null,
    rawQuery: "",
    rawLabel: "",
  };
}

/** @returns {Criteria} Criteria with no filters at all. */
export function emptyCriteria() {
  return { ...defaultCriteria(), format: null, game: null, excludeRebalanced: false };
}

const GAMES = ["arena", "mtgo", "paper"];

/**
 * Popularity by EDHREC rank, which counts Commander decks. Rank 1 is in
 * the most decks. Checked against the live API on 2026-11-20.
 */
export const POPULARITY = Object.freeze({
  staple: { term: "edhrec<1000", label: "Staples: top 1,000 in Commander", name: "Staples (top 1,000)" },
  popular: { term: "edhrec<5000", label: "Popular: top 5,000 in Commander", name: "Popular (top 5,000)" },
  spicy: { term: "edhrec>10000", label: "Spicy: rarely played in Commander", name: "Spicy (rarely played)" },
});

/**
 * Number of abilities, counted as paragraphs of rules text. Scryfall's
 * regular expressions match line by line, so the counts look for line
 * breaks (\n) instead of anchoring the whole text.
 */
const ABILITY_TERMS = {
  none: { term: "is:vanilla", label: "No abilities", name: "None (vanilla)" },
  keywords: { term: "is:frenchvanilla", label: "Keywords only", name: "Keywords only" },
  1: { term: "o:/./ -o:/\\n/", label: "1 ability", name: "1" },
  2: { term: "o:/\\n/ -o:/\\n[^\\n]*\\n/", label: "2 abilities", name: "2" },
  "3plus": { term: "o:/\\n[^\\n]*\\n/", label: "3 or more abilities", name: "3 or more" },
};
export const ABILITY_COUNTS = ["none", "keywords", "1", "2", "3plus"];
/** @param {string} key */
export const abilityCountName = (key) => ABILITY_TERMS[key]?.name ?? key;

/** Common creature keywords for the Creature abilities checkboxes. */
export const CREATURE_KEYWORDS = Object.freeze([
  "flying", "trample", "haste", "lifelink", "deathtouch", "vigilance", "first strike",
  "double strike", "menace", "reach", "hexproof", "ward", "indestructible", "flash", "defender",
]);

/** What the card does. Each tag is in VERIFIED_TAGS in src/explore.js. */
export const CARD_ROLES = Object.freeze([
  { tag: "removal-creature", label: "Creature removal" },
  { tag: "ramp", label: "Ramp" },
  { tag: "draw", label: "Card draw" },
  { tag: "counterspell", label: "Counterspell" },
  { tag: "sweeper", label: "Board wipe" },
  { tag: "burn", label: "Burn" },
  { tag: "tutor", label: "Tutor" },
  { tag: "combat-trick", label: "Combat trick" },
]);
const ROLE_TAGS = CARD_ROLES.map((r) => r.tag);

/** The first year of Magic cards. Years before it aren't valid. */
const FIRST_YEAR = 1993;
const SET_CODE = /^[a-z0-9]{2,8}$/;

/** Set types left out of the Set list: they hold no game cards. */
const HIDDEN_SET_TYPES = ["token", "memorabilia", "promo", "minigame", "vanguard", "treasure_chest"];

/**
 * The sets to choose from, newest first, from a Scryfall /sets response.
 * @param {any} body
 * @returns {{code: string, name: string, released: string}[]}
 */
export function setOptions(body) {
  if (!body || !Array.isArray(body.data)) return [];
  return body.data
    .filter((s) => s && SET_CODE.test(s.code ?? "") && typeof s.name === "string" && !HIDDEN_SET_TYPES.includes(s.set_type) && s.card_count > 0)
    .map((s) => ({ code: s.code, name: s.name, released: typeof s.released_at === "string" ? s.released_at : "" }))
    .sort((a, b) => (a.released === b.released ? a.name.localeCompare(b.name) : a.released < b.released ? 1 : -1));
}
const COLOR_MODES = ["any", "exactly", "atLeast", "atMost"];
const OPERATORS = { exactly: "=", atLeast: ">=", atMost: "<=" };

function toWholeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function toYear(value) {
  const n = toWholeNumber(value);
  return n !== null && n >= FIRST_YEAR && n <= 2100 ? n : null;
}

/** A price in dollars, rounded to cents, or null. */
function toPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function toSets(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object" || typeof s.code !== "string") continue;
    const code = s.code.trim().toLowerCase();
    if (!SET_CODE.test(code) || out.some((x) => x.code === code)) continue;
    const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : code.toUpperCase();
    out.push({ code, name });
  }
  return out;
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
    popularity: Object.hasOwn(POPULARITY, input.popularity ?? "") ? input.popularity : null,
    yearMin: toYear(input.yearMin),
    yearMax: toYear(input.yearMax),
    sets: toSets(input.sets),
    abilityCount: ABILITY_COUNTS.includes(input.abilityCount) ? input.abilityCount : null,
    creatureKeywords: pick(input.creatureKeywords, CREATURE_KEYWORDS),
    powMin: toWholeNumber(input.powMin),
    powMax: toWholeNumber(input.powMax),
    touMin: toWholeNumber(input.touMin),
    touMax: toWholeNumber(input.touMax),
    roles: pick(input.roles, ROLE_TAGS),
    canBeCommander: input.canBeCommander === true,
    priceMax: toPrice(input.priceMax),
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
  const range = (key, min, max, message, field = key) => {
    if (min !== null && max !== null && min === max) {
      parts.push(`${key}=${min}`);
      return;
    }
    if (min !== null) parts.push(`${key}>=${min}`);
    if (max !== null) parts.push(`${key}<=${max}`);
    if (min !== null && max !== null && min > max) hints.push({ field, message });
  };

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
  const hasAge = c.yearMin !== null || c.yearMax !== null;
  // Scryfall checks game: and year against the same printing, so an old
  // card whose first printing isn't on Arena would be lost. With an age,
  // in: checks every printing of the card instead.
  if (c.game) parts.push(`${hasAge ? "in" : "game"}:${c.game}`);
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

  range("mv", c.mvMin, c.mvMax, "The minimum mana value is more than the maximum, so no cards match.");

  const rarities = orGroup(RARITIES.filter((r) => c.rarities.includes(r)).map((r) => `r:${r}`));
  if (rarities) parts.push(rarities);

  freeText("keyword", "Keyword ability", (v) => textTerm("kw", v));
  freeText("oracleText", "Rules text", (v) => textTerm("o", v, true));

  if (c.popularity) parts.push(POPULARITY[c.popularity].term);

  if (hasAge) {
    range("year", c.yearMin, c.yearMax, "The first year is after the last year, so no cards match.");
    parts.push("not:reprint");
  }

  const sets = orGroup(c.sets.map((s) => `e:${s.code}`));
  if (sets) parts.push(sets);

  if (c.abilityCount) parts.push(ABILITY_TERMS[c.abilityCount].term);

  for (const k of CREATURE_KEYWORDS.filter((x) => c.creatureKeywords.includes(x))) parts.push(textTerm("kw", k));

  range("pow", c.powMin, c.powMax, "The minimum power is more than the maximum, so no cards match.");
  range("tou", c.touMin, c.touMax, "The minimum toughness is more than the maximum, so no cards match.");

  const roles = orGroup(ROLE_TAGS.filter((t) => c.roles.includes(t)).map((t) => `otag:${t}`));
  if (roles) parts.push(roles);

  if (c.canBeCommander) parts.push("is:commander");

  if (c.priceMax !== null) {
    if (priceApplies(c)) parts.push(`usd<=${c.priceMax}`);
    else hints.push({ field: "price", message: "Prices are for paper cards. Set Game to Paper or Any to use the price." });
  }

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

/** Paper prices don't apply to cards on Arena or MTGO. */
const priceApplies = (c) => c.game !== "arena" && c.game !== "mtgo";

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
function rangeLabel(name, min, max) {
  if (min !== null && max !== null) return min === max ? `${name} ${min}` : `${name} ${min} to ${max}`;
  return min !== null ? `${name} ${min} or more` : `${name} ${max} or less`;
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
    chips.push({ id: "mv", label: rangeLabel("Mana value", c.mvMin, c.mvMax), clear: { mvMin: null, mvMax: null } });
  }
  if (c.rarities.length) chips.push({ id: "rarities", label: cap(joinOr(RARITIES.filter((r) => c.rarities.includes(r)))), clear: { rarities: [] } });
  if (c.keyword.trim()) chips.push({ id: "keyword", label: `Keyword: ${short(c.keyword.trim())}`, clear: { keyword: "" } });
  if (c.oracleText.trim()) chips.push({ id: "oracleText", label: `Text: ${short(c.oracleText.trim())}`, clear: { oracleText: "" } });
  if (c.popularity) chips.push({ id: "popularity", label: POPULARITY[c.popularity].label, clear: { popularity: null } });
  if (c.yearMin !== null || c.yearMax !== null) {
    const { yearMin: a, yearMax: b } = c;
    const label = a !== null && b !== null
      ? (a === b ? `First printed in ${a}` : `First printed ${a} to ${b}`)
      : a !== null ? `First printed ${a} or later` : `First printed ${b} or earlier`;
    chips.push({ id: "year", label, clear: { yearMin: null, yearMax: null } });
  }
  if (c.sets.length) {
    const label = `${c.sets.length === 1 ? "Set" : "Sets"}: ${short(joinOr(c.sets.map((s) => s.name)), 60)}`;
    chips.push({ id: "sets", label, clear: { sets: [] } });
  }
  if (c.abilityCount) chips.push({ id: "abilityCount", label: ABILITY_TERMS[c.abilityCount].label, clear: { abilityCount: null } });
  if (c.creatureKeywords.length) {
    const words = CREATURE_KEYWORDS.filter((k) => c.creatureKeywords.includes(k));
    chips.push({ id: "creatureKeywords", label: cap(joinAnd(words)), clear: { creatureKeywords: [] } });
  }
  if (c.powMin !== null || c.powMax !== null) chips.push({ id: "pow", label: rangeLabel("Power", c.powMin, c.powMax), clear: { powMin: null, powMax: null } });
  if (c.touMin !== null || c.touMax !== null) chips.push({ id: "tou", label: rangeLabel("Toughness", c.touMin, c.touMax), clear: { touMin: null, touMax: null } });
  if (c.roles.length) {
    const words = CARD_ROLES.filter((r) => c.roles.includes(r.tag)).map((r) => r.label.toLowerCase());
    chips.push({ id: "roles", label: cap(joinOr(words)), clear: { roles: [] } });
  }
  if (c.canBeCommander) chips.push({ id: "canBeCommander", label: "Can be your commander", clear: { canBeCommander: false } });
  if (c.priceMax !== null && priceApplies(c)) {
    const price = Number.isInteger(c.priceMax) ? `$${c.priceMax}` : `$${c.priceMax.toFixed(2)}`;
    chips.push({ id: "price", label: `${price} or less`, clear: { priceMax: null } });
  }
  if (c.rawQuery.trim()) {
    const label = c.rawLabel.trim() || `Custom search: ${short(c.rawQuery.trim())}`;
    chips.push({ id: "rawQuery", label, clear: { rawQuery: "", rawLabel: "" } });
  }
  return chips;
}

/**
 * How many filters are on in each group of the Filters panel that opens
 * and closes. A range or a set of checkboxes counts as one filter.
 * @param {Criteria} input
 */
export function filterGroupCounts(input) {
  const c = normalizeCriteria(input);
  const on = (...xs) => xs.filter(Boolean).length;
  return {
    card: on(c.roles.length, c.abilityCount, c.canBeCommander, c.keyword.trim(), c.oracleText.trim()),
    creature: on(c.creatureKeywords.length, c.powMin !== null || c.powMax !== null, c.touMin !== null || c.touMax !== null),
    printing: on(c.yearMin !== null || c.yearMax !== null, c.sets.length, c.priceMax !== null),
    popularity: on(c.popularity),
  };
}

/** @param {string} query */
export function scryfallSearchUrl(query) {
  return `https://scryfall.com/search?q=${encodeURIComponent(query)}`;
}
