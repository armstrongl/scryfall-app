// Synergy suggestions: searches for cards that may work well with a card.
// Pure module. It reads only the saved card data (rules text, type line,
// colors), so it works for old saved cards without a new request.
//
// The suggestions come from patterns in the rules text. They are a starting
// point, not a judgment: the user can open each search on Scryfall and change it.
// Every partner query here was checked against the live API on 2026-11-04.
// To check them again, run scripts/check-api.mjs ("Synergy queries").

import { COLORS } from "./config.js";
import { emptyCriteria, normalizeCriteria } from "./query.js";

/**
 * @typedef {Object} Suggestion
 * @property {string} id A stable key, for example "sacrifice-fodder".
 * @property {string} label A short title.
 * @property {string} reason Why the app suggests it.
 * @property {string} query A Scryfall query fragment.
 */

/** The most suggestions for one card. */
export const MAX_SUGGESTIONS = 8;

// Partner queries. `~` matches the card's own name and also "this creature".
const Q = Object.freeze({
  dies: '(o:"when ~ dies" or o:"whenever a creature you control dies" or o:"whenever another creature you control dies")',
  sacOutlets: '(o:"sacrifice a creature" or o:"sacrifice another creature")',
  goWide: '(o:"creatures you control get" or o:"for each creature you control" or o:"whenever a creature you control enters" or o:"whenever another creature you control enters")',
  tokenMakers: '(o:"create" o:"token")',
  lifePayoffs: 'o:"whenever you gain life"',
  lifeSources: '(o:"you gain" or kw:lifelink)',
  counters: '(o:"+1/+1 counter" or o:"proliferate")',
  graveyardPayoffs: '(o:"from your graveyard" or o:"cards in your graveyard")',
  graveyardFillers: '(kw:surveil or o:"mill")',
  spells: "(t:instant or t:sorcery)",
  spellPayoffs: '(kw:prowess or o:"noncreature spell" or o:"instant or sorcery spell")',
  artifacts: "t:artifact",
  artifactPayoffs: '(o:"artifacts you control" or o:"artifact spells" or o:"whenever an artifact" or o:"whenever another artifact" or o:"for each artifact")',
  enchantments: "t:enchantment",
  enchantmentPayoffs: '(o:"enchantments you control" or o:"enchantment spells" or o:"whenever an enchantment" or o:"whenever another enchantment" or kw:constellation)',
  landfall: '(kw:landfall or o:"whenever a land you control enters")',
  landRamp: '(o:"play an additional land" or (o:"search your library" o:"land card"))',
  enterTriggers: 't:creature o:"when ~ enters"',
  blink: '(o:"exile target creature you control" or o:"exile another target creature you control" or o:"exile up to one target creature you control" or o:"exile target nontoken creature you control")',
});

/** The fixed partner queries, by name. For the live API check script. */
export const PARTNER_QUERIES = Q;

/**
 * Rules that read the rules text. `text` is lowercase, with reminder text
 * removed and the card's own name replaced by "~".
 * @type {{id: string, label: string, reason: string, query: string, test: (text: string) => boolean}[]}
 */
const TEXT_RULES = [
  {
    id: "sacrifice-fodder",
    label: "Creatures to sacrifice",
    reason: "This card sacrifices creatures. These cards do something when a creature dies.",
    query: Q.dies,
    // "Sacrifice a creature" and "Sacrifice another Goblin", but not
    // artifacts, lands, or other noncreature permanents.
    test: (t) => /\bsacrifice (?:a|an|another|one or more) (?:other )?(?:nontoken )?(?!(?:artifact|enchantment|land|permanent|treasure|food|clue|blood|map|card|token)s?\b)[a-z]+\b/.test(t),
  },
  {
    id: "sacrifice-outlets",
    label: "Ways to sacrifice",
    reason: "This card does something when a creature dies. These cards let you sacrifice creatures when you choose.",
    query: Q.sacOutlets,
    test: (t) => /\bwhen(?:ever)? [^.]*\bdies?\b/.test(t),
  },
  {
    id: "go-wide",
    label: "Rewards for many creatures",
    reason: "This card makes tokens. These cards get better with more creatures.",
    query: Q.goWide,
    test: (t) => /\bcreates? [^.]*\bcreature tokens?\b|\bcreates? [^.]*\btoken that's a copy\b/.test(t),
  },
  {
    id: "token-makers",
    label: "Token makers",
    reason: "This card rewards you for having many creatures. These cards make tokens.",
    query: Q.tokenMakers,
    test: (t) => /\bcreatures you control get\b|\bfor each creature you control\b|\bwhenever (?:a|another) (?:nontoken )?creature you control enters\b|\btokens you control\b/.test(t),
  },
  {
    id: "lifegain-payoffs",
    label: "Rewards for gaining life",
    reason: "This card gains life. These cards do something when you gain life.",
    query: Q.lifePayoffs,
    test: (t) => /\byou gain (?:\d+|x|that much) life\b|\bgain (?:\d+|x) life\b|\blifelink\b/.test(t),
  },
  {
    id: "lifegain-sources",
    label: "Ways to gain life",
    reason: "This card does something when you gain life. These cards gain life.",
    query: Q.lifeSources,
    test: (t) => /\bwhenever you gain life\b|\bif you gained life\b|\byou've gained life\b/.test(t),
  },
  {
    id: "counters",
    label: "More +1/+1 counters",
    reason: "This card uses +1/+1 counters. These cards add counters or care about them.",
    query: Q.counters,
    test: (t) => /\+1\/\+1 counters?\b/.test(t),
  },
  {
    id: "graveyard-payoffs",
    label: "Uses for your graveyard",
    reason: "This card puts cards into your graveyard. These cards use cards in your graveyard.",
    query: Q.graveyardPayoffs,
    test: (t) => /\bmills?\b|\bsurveil\b|\byou (?:may )?discard\b|\bthen discard\b|\bdiscard (?:a|two|three) cards?\b/.test(t),
  },
  {
    id: "graveyard-fillers",
    label: "Ways to fill your graveyard",
    reason: "This card uses cards in your graveyard. These cards put cards there.",
    query: Q.graveyardFillers,
    test: (t) => /\bfrom your graveyard\b|\bcards? in your graveyard\b|\bflashback\b|\bunearth\b|\bescape\b/.test(t),
  },
  {
    id: "spells",
    label: "Instants and sorceries",
    reason: "This card rewards you for casting instants and sorceries.",
    query: Q.spells,
    test: (t) => /\binstant or sorcery spells?\b|\bnoncreature spells?\b|\bprowess\b|\bmagecraft\b/.test(t),
  },
  {
    id: "artifacts",
    label: "More artifacts",
    reason: "This card makes or rewards artifacts.",
    query: Q.artifacts,
    test: (t) => /\bartifacts you control\b|\bartifact spells?\b|\bwhenever (?:an|another) artifact\b|\bfor each artifact\b|\bsacrifice an artifact\b|\bcreates? [^.]*\b(?:treasure|clue|food|blood|map|powerstone|artifact) tokens?\b|\baffinity for artifacts\b|\bimprovise\b/.test(t),
  },
  {
    id: "enchantments",
    label: "More enchantments",
    reason: "This card rewards you for having or casting enchantments.",
    query: Q.enchantments,
    test: (t) => /\benchantments you control\b|\benchantment spells?\b|\bwhenever (?:an|another) enchantment\b|\bfor each enchantment\b|\bconstellation\b/.test(t),
  },
  {
    id: "land-ramp",
    label: "Extra land drops",
    reason: "This card does something when a land enters. These cards put more lands onto the battlefield.",
    query: Q.landRamp,
    test: (t) => /\blandfall\b|\bwhenever a land (?:you control )?enters\b|\bwhenever one or more lands\b/.test(t),
  },
  {
    id: "landfall",
    label: "Rewards for lands entering",
    reason: "This card puts extra lands onto the battlefield. These cards do something when a land enters.",
    query: Q.landfall,
    test: (t) => /\bsearch your library for [^.]*\bland cards?\b|\bplay an additional land\b/.test(t),
  },
  {
    id: "enter-triggers",
    label: "Creatures with enter abilities",
    reason: "This card exiles your creatures and returns them. These creatures do something when they enter.",
    query: Q.enterTriggers,
    test: (t) => /\bexile [^.]*\byou control\b[^.]*\.? [^.]*\breturn\b[^.]*\bto the battlefield\b/.test(t),
  },
];

/**
 * Rules that read the card's own types. `types` is the lowercase type line.
 * @type {{id: string, label: string, reason: string, query: string, test: (types: string, text: string) => boolean}[]}
 */
const TYPE_RULES = [
  {
    id: "spell-payoffs",
    label: "Rewards for casting spells",
    reason: "This card is an instant or sorcery. These cards reward you for casting them.",
    query: Q.spellPayoffs,
    test: (types) => /\b(?:instant|sorcery)\b/.test(types),
  },
  {
    id: "artifact-payoffs",
    label: "Rewards for artifacts",
    reason: "This card is an artifact. These cards reward you for having or casting artifacts.",
    query: Q.artifactPayoffs,
    test: (types) => /\bartifact\b/.test(types),
  },
  {
    id: "enchantment-payoffs",
    label: "Rewards for enchantments",
    reason: "This card is an enchantment. These cards reward you for having or casting enchantments.",
    query: Q.enchantmentPayoffs,
    test: (types) => /\benchantment\b/.test(types),
  },
  {
    id: "blink",
    label: "Ways to use enter abilities again",
    reason: "This creature does something when it enters. These cards exile a creature you control and return it.",
    query: Q.blink,
    test: (types, text) => /\bcreature\b/.test(types) && /\bwhen(?:ever)? ~ enters\b/.test(text),
  },
];

/** Words that look like a type in the rules text but are not. */
const NOT_SUBTYPES = new Set([
  "~", "creature", "creatures", "artifact", "enchantment", "land", "lands", "instant", "sorcery",
  "planeswalker", "battle", "kindred", "tribal", "legendary", "basic", "snow", "token", "tokens",
  "spell", "spells", "card", "cards", "permanent", "permanents", "target", "each", "any", "all",
  "other", "another", "you", "your", "this", "that", "those",
]);

/** "Elves" → "Elf", "Goblins" → "Goblin", "Foxes" → "Fox". */
export function singularType(word) {
  if (/(?:wolves|elves|dwarves)$/i.test(word)) return word.replace(/ves$/, "f");
  if (/[^aeiou]ies$/i.test(word)) return word.replace(/ies$/, "y");
  if (/(?:x|ch|sh|ss)es$/i.test(word)) return word.replace(/es$/, "");
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** "Elf" → "Elves", "Goblin" → "Goblins", "Fox" → "Foxes". */
export function pluralType(word) {
  if (/(?:wolf|elf|dwarf)$/i.test(word)) return word.replace(/f$/, "ves");
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/, "ies");
  if (/(?:x|ch|sh|s)$/i.test(word)) return `${word}es`;
  if (/folk$/i.test(word)) return word;
  return `${word}s`;
}

/**
 * The creature subtypes in a type line, from every face that is a creature
 * or a kindred card. "Creature — Goblin Warrior" gives ["Goblin", "Warrior"].
 * @param {string} typeLine
 */
export function creatureSubtypes(typeLine) {
  const out = [];
  for (const face of (typeLine ?? "").split(" // ")) {
    const [left, right] = face.split("—");
    if (!right || !/\b(?:Creature|Kindred|Tribal)\b/.test(left)) continue;
    for (const word of right.trim().split(/\s+/)) {
      if (/^[A-Z][A-Za-z'-]+$/.test(word) && !out.includes(word)) out.push(word);
    }
  }
  return out;
}

/**
 * Types that the rules text refers to, such as "Goblin" in "Other Goblins
 * you control get +1/+1". The words must be capitalized in the middle of a
 * sentence, or follow "other" or "another", which is how Oracle text writes
 * subtypes. Words before "creature token" are skipped, because making a
 * Goblin token is not the same as rewarding Goblins.
 * @param {string} text Rules text with the card's name replaced by "~".
 */
export function mentionedSubtypes(text) {
  const found = [];
  const add = (word) => {
    const single = singularType(word);
    if (NOT_SUBTYPES.has(single.toLowerCase()) || found.includes(single)) return;
    found.push(single);
  };
  const lines = text.split("\n");
  for (const line of lines) {
    for (const m of line.matchAll(/\b(?:[Oo]ther|[Aa]nother)\s+([A-Z][a-z]+)\b/g)) add(m[1]);
    for (const m of line.matchAll(/[a-z,] ([A-Z][a-z]+) (creatures?|spells?|cards?|permanents?|you control)\b( tokens?)?/g)) {
      if (!m[3]) add(m[1]);
    }
  }
  return found;
}

function typeQuery(subtype) {
  return `t:${subtype.toLowerCase()}`;
}

/** Cards that reward a creature type, for example "other Elves you control". */
export function rewardsQuery(subtype) {
  const one = subtype;
  const many = pluralType(subtype);
  const terms = [
    `o:"other ${one}"`, `o:"another ${one}"`, `o:"${one} you control"`,
    `o:"${one} creature"`, `o:"${one} spell"`,
  ];
  if (many !== one) terms.push(`o:"other ${many}"`, `o:"${many} you control"`);
  return `(${terms.join(" or ")})`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rules text ready for matching: reminder text removed, and the card's own
 * name (full, each face, and the short name before a comma) replaced by "~".
 * Keeps the original case so subtypes can be found.
 * @param {import("./cards.js").CardSnapshot} snapshot
 */
export function preparedText(snapshot) {
  let text = (snapshot.oracleText ?? "").replace(/\([^)]*\)/g, "");
  const names = new Set();
  for (const n of [snapshot.name, snapshot.frontName, ...(snapshot.name ?? "").split(" // ")]) {
    if (!n) continue;
    names.add(n);
    const short = n.split(",")[0].trim();
    if (short.length >= 3) names.add(short);
  }
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const n of sorted) text = text.replace(new RegExp(`\\b${escapeRegExp(n)}\\b`, "g"), "~");
  return text;
}

/**
 * Searches for cards that may work with this card, most specific first.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @returns {Suggestion[]}
 */
export function suggestSynergies(snapshot) {
  const text = preparedText(snapshot);
  const lower = text.toLowerCase();
  const types = (snapshot.typeLine ?? "").toLowerCase();
  const out = [];
  const add = (s) => {
    if (!out.some((x) => x.id === s.id || x.query === s.query)) out.push(s);
  };

  for (const sub of mentionedSubtypes(text)) {
    add({
      id: `typal-${sub.toLowerCase()}`,
      label: `More ${pluralType(sub)}`,
      reason: `This card refers to ${pluralType(sub)}.`,
      query: typeQuery(sub),
    });
  }
  for (const rule of TEXT_RULES) {
    if (rule.test(lower)) add({ id: rule.id, label: rule.label, reason: rule.reason, query: rule.query });
  }
  for (const rule of TYPE_RULES) {
    if (rule.test(types, lower)) add({ id: rule.id, label: rule.label, reason: rule.reason, query: rule.query });
  }
  for (const sub of creatureSubtypes(snapshot.typeLine).slice(0, 2)) {
    add({
      id: `rewards-${sub.toLowerCase()}`,
      label: `Rewards for ${pluralType(sub)}`,
      reason: `This card is a ${sub}. These cards reward you for having ${pluralType(sub)}.`,
      query: rewardsQuery(sub),
    });
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * Criteria for one suggestion. Keeps the format, game, and rebalanced
 * setting from `base`, limits colors to the card's color identity, and
 * leaves the card itself out of the results.
 * @param {any} base Criteria to take the format and game from.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @param {Suggestion} suggestion
 * @returns {import("./query.js").Criteria}
 */
export function synergyCriteria(base, snapshot, suggestion) {
  const b = normalizeCriteria(base);
  const c = { ...emptyCriteria(), format: b.format, game: b.game, excludeRebalanced: b.excludeRebalanced };
  const identity = COLORS.filter((x) => (snapshot.colorIdentity ?? []).includes(x.toUpperCase()));
  if (identity.length > 0) {
    c.colorMode = "atMost";
    c.colors = identity;
  }
  const exclude = snapshot.name && !snapshot.name.includes('"') ? ` -!"${snapshot.name}"` : "";
  c.rawQuery = `${suggestion.query}${exclude}`;
  return normalizeCriteria(c);
}
