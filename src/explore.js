// Explore: synergies, similar cards, and counters for one card. Pure module.
//
// Suggestions are Scryfall searches. They read only the saved card data
// (rules text, type line, keywords, colors, mana value), so they work for old
// saved cards without a new request. Searches use Scryfall Tagger oracle tags
// (otag:), which are community data, combined with keyword or rules-text
// terms, so a missing tag never empties a search. Every tag in VERIFIED_TAGS
// was checked against the live API on 2026-11-05. To check them again, run
// scripts/check-api.mjs ("Explore tags").

import { COLORS, COLOR_NAMES } from "./config.js";
import { emptyCriteria, normalizeCriteria } from "./query.js";
import { creatureSubtypes, mentionedSubtypes, pluralType, preparedText, rewardsQuery } from "./synergy.js";

/** Tags that returned cards from the live API. Tests allow only these. */
export const VERIFIED_TAGS = Object.freeze([
  "landfall", "land-ramp", "synergy-enchantment", "enchantress", "synergy-artifact", "synergy-token",
  "anthem", "repeatable-creature-tokens", "counters-matter", "counter-doubler", "lifegain-matters",
  "lifegain", "death-trigger", "synergy-sacrifice", "sacrifice-outlet", "self-mill", "recursion",
  "reanimate", "synergy-graveyard-cast", "synergy-instant", "synergy-sorcery", "synergy-noncreature",
  "blink", "flicker", "synergy-legendary", "synergy-equipment", "synergy-aura", "synergy-treasure",
  "synergy-food", "synergy-clue", "discard-outlet", "synergy-discard", "synergy-vehicle", "draw",
  "ramp", "removal-creature", "counterspell", "burn", "sweeper", "tutor", "edict", "removal-exile",
  "removal-enchantment", "disenchant", "removal-artifact", "hate-artifact", "removal-planeswalker",
  "hate-planeswalker", "hate-flying", "graveyard-hate", "hate-lifegain", "hate-token", "removal-land",
  "combat-trick",
]);

/** Formats where a deck's colors are its commander's color identity. */
export const IDENTITY_FORMATS = Object.freeze(["brawl", "standardbrawl", "commander", "competitivebrawl", "oathbreaker", "paupercommander", "duel", "predh"]);

/**
 * @typedef {Object} ExploreSuggestion
 * @property {string} id
 * @property {string} label What the search finds, in plain words.
 * @property {string} reason Why the app suggests it.
 * @property {string} query A Scryfall query fragment.
 * @property {"card"|"any"} colors "card": limit to the card's colors. "any": no color limit.
 */

/** The most suggestions in each group. */
export const MAX_PER_GROUP = 8;

// Card facts -------------------------------------------------------------------

/**
 * Facts the rules below read.
 * @param {import("./cards.js").CardSnapshot} snapshot
 */
function facts(snapshot) {
  const text = preparedText(snapshot)
    .replace(/\bthis (?:creature|card|permanent|enchantment|artifact|land|spell|vehicle|equipment|aura)\b/gi, "~");
  return {
    text,
    lower: text.toLowerCase(),
    types: (snapshot.typeLine ?? "").toLowerCase(),
    keywords: new Set((snapshot.keywords ?? []).map((k) => k.toLowerCase())),
    manaValue: typeof snapshot.manaValue === "number" ? snapshot.manaValue : 0,
  };
}

const has = (re) => (f) => re.test(f.lower);
const isType = (re) => (f) => re.test(f.types);

// Themes -----------------------------------------------------------------------
// Each theme has two sides. A card on the "payoff" side rewards the theme, and
// a card on the "enabler" side feeds it. A payoff card gets more payoffs (more
// of the same mechanic) and enablers. An enabler card gets payoffs.

/**
 * @typedef {{phrase: string, query: string}} Side
 * @typedef {{id: string, why: string, payoff: Side, enabler: Side, isPayoff: (f: any) => boolean, isEnabler: (f: any) => boolean}} Theme
 * @type {Theme[]}
 */
const THEMES = [
  {
    id: "landfall",
    why: "lands entering the battlefield",
    payoff: { phrase: "leverage landfall", query: "(otag:landfall or kw:landfall)" },
    enabler: { phrase: "put extra lands onto the battlefield", query: '(otag:land-ramp or o:"play an additional land")' },
    isPayoff: (f) => f.keywords.has("landfall") || /\bwhenever (?:a|one or more) lands? (?:you control )?enters?\b/.test(f.lower),
    isEnabler: has(/\bplay an additional land\b|\bsearch your library for [^.]*\bland cards?\b[^.]*\bonto the battlefield\b|\bput a land card from your hand onto the battlefield\b/),
  },
  {
    id: "enchantments",
    why: "enchantments",
    payoff: { phrase: "benefit from enchantments", query: "(otag:synergy-enchantment or otag:enchantress or kw:constellation)" },
    enabler: { phrase: "are enchantments", query: "t:enchantment" },
    isPayoff: (f) => f.keywords.has("constellation") || /\benchantments? you control\b|\benchantment spells?\b|\bwhenever (?:an|another) enchantment\b|\bfor each enchantment\b/.test(f.lower),
    isEnabler: isType(/\benchantment\b/),
  },
  {
    id: "artifacts",
    why: "artifacts",
    payoff: { phrase: "benefit from artifacts", query: '(otag:synergy-artifact or o:"artifacts you control")' },
    enabler: { phrase: "are artifacts", query: "t:artifact" },
    isPayoff: (f) => f.keywords.has("affinity") || f.keywords.has("improvise") || /\bartifacts you control\b|\bartifact spells?\b|\bwhenever (?:an|another) artifact\b|\bfor each artifact\b/.test(f.lower),
    isEnabler: (f) => /\bartifact\b/.test(f.types) || /\bcreates? [^.]*\bartifact (?:creature )?tokens?\b/.test(f.lower),
  },
  {
    id: "go-wide",
    why: "having many creatures",
    payoff: { phrase: "reward you for having many creatures", query: "(otag:synergy-token or otag:anthem)" },
    enabler: { phrase: "make creature tokens", query: '(otag:repeatable-creature-tokens or (o:create o:"creature token"))' },
    isPayoff: has(/\bcreatures you control get\b|\bfor each creature you control\b|\bwhenever (?:a|another) (?:nontoken )?creature you control enters\b|\btokens you control\b/),
    isEnabler: has(/\bcreates? [^.]*\bcreature tokens?\b/),
  },
  {
    id: "counters",
    why: "+1/+1 counters",
    payoff: { phrase: "care about +1/+1 counters", query: "(otag:counters-matter or otag:counter-doubler)" },
    enabler: { phrase: "put +1/+1 counters on creatures", query: '(o:"put a +1/+1 counter" or o:"put two +1/+1 counters" or kw:proliferate)' },
    isPayoff: has(/\bwith (?:a|one or more) \+1\/\+1 counters? on\b|\bfor each \+1\/\+1 counter\b|\bwhenever [^.]*\+1\/\+1 counters? (?:is|are) put\b|\bproliferate\b/),
    isEnabler: has(/\bput (?:a|an additional|two|three|x|that many) \+1\/\+1 counters?\b/),
  },
  {
    id: "lifegain",
    why: "gaining life",
    payoff: { phrase: "reward you for gaining life", query: '(otag:lifegain-matters or o:"whenever you gain life")' },
    enabler: { phrase: "gain life", query: "(otag:lifegain or kw:lifelink)" },
    isPayoff: has(/\bwhenever you gain life\b|\bif you gained life\b|\byou've gained life\b/),
    isEnabler: (f) => f.keywords.has("lifelink") || /\byou gain (?:\d+|x|that much) life\b|\bgain (?:\d+|x) life\b/.test(f.lower),
  },
  {
    id: "sacrifice",
    why: "sacrificing creatures",
    payoff: { phrase: "do something when creatures die", query: "(otag:death-trigger or otag:synergy-sacrifice)" },
    enabler: { phrase: "let you sacrifice creatures", query: "otag:sacrifice-outlet" },
    isPayoff: has(/\bwhenever (?:a|another|one or more) (?:other )?(?:nontoken )?creatures? (?:you control )?dies?\b|\bwhenever you sacrifice\b/),
    isEnabler: has(/\bsacrifice (?:a|an|another|one or more) (?:other )?(?:nontoken )?(?:creature|[a-z]+ creature)s?\b/),
  },
  {
    id: "graveyard",
    why: "your graveyard",
    payoff: { phrase: "use cards in your graveyard", query: "(otag:recursion or otag:reanimate or otag:synergy-graveyard-cast)" },
    enabler: { phrase: "fill your graveyard", query: "(otag:self-mill or kw:surveil)" },
    isPayoff: (f) => ["flashback", "escape", "unearth", "disturb", "embalm", "eternalize"].some((k) => f.keywords.has(k)) || /\bfrom your graveyard\b|\bcards? in your graveyard\b/.test(f.lower),
    isEnabler: (f) => f.keywords.has("surveil") || /\bmills?\b|\byou (?:may )?discard\b|\bthen discard\b/.test(f.lower),
  },
  {
    id: "spells",
    why: "casting instants and sorceries",
    payoff: { phrase: "reward you for casting instants and sorceries", query: "(otag:synergy-instant or otag:synergy-sorcery or otag:synergy-noncreature or kw:prowess)" },
    enabler: { phrase: "are cheap instants and sorceries", query: "(t:instant or t:sorcery) mv<=2" },
    isPayoff: (f) => f.keywords.has("prowess") || f.keywords.has("magecraft") || /\binstant (?:or|and) sorcery spells?\b|\bnoncreature spells?\b|\binstant and sorcery cards?\b/.test(f.lower),
    isEnabler: isType(/\b(?:instant|sorcery)\b/),
  },
  {
    id: "blink",
    why: "enter abilities",
    payoff: { phrase: "have enter abilities", query: 't:creature o:"when ~ enters"' },
    enabler: { phrase: "blink your creatures to use enter abilities again", query: "(otag:blink or otag:flicker)" },
    isPayoff: has(/\bexile [^.]*\byou control\b[^.]*\.? [^.]*\breturn\b[^.]*\bto the battlefield\b/),
    isEnabler: (f) => /\bcreature\b/.test(f.types) && /\bwhen(?:ever)? ~ enters\b/.test(f.lower),
  },
  {
    id: "legendary",
    why: "legendary and historic cards",
    payoff: { phrase: "reward legendary and historic cards", query: "(otag:synergy-legendary or o:historic)" },
    enabler: { phrase: "are legendary", query: "t:legendary" },
    isPayoff: has(/\bhistoric\b|\blegendary (?:creatures?|spells?|permanents?)\b/),
    isEnabler: isType(/\blegendary\b/),
  },
  {
    id: "equipment",
    why: "Equipment",
    payoff: { phrase: "reward Equipment", query: "otag:synergy-equipment" },
    enabler: { phrase: "are Equipment", query: "t:equipment" },
    isPayoff: (f) => !/\bequipment\b/.test(f.types) && /\bequipped\b|\bequipment you control\b|\battach\b/.test(f.lower),
    isEnabler: isType(/\bequipment\b/),
  },
  {
    id: "auras",
    why: "Auras",
    payoff: { phrase: "reward Auras", query: "otag:synergy-aura" },
    enabler: { phrase: "are Auras", query: "t:aura" },
    isPayoff: has(/\bauras? you control\b|\bwhenever an aura\b|\benchanted by an aura\b/),
    isEnabler: isType(/\baura\b/),
  },
  {
    id: "treasure",
    why: "Treasure, Food, and Clues",
    payoff: { phrase: "use Treasure, Food, and Clues", query: "(otag:synergy-treasure or otag:synergy-food or otag:synergy-clue)" },
    enabler: { phrase: "make Treasure, Food, or Clues", query: "(o:create (o:treasure or o:food or o:clue))" },
    isPayoff: has(/\bsacrifice (?:a|an|another) (?:treasure|food|clue)\b|\b(?:treasures|foods|clues) you control\b/),
    isEnabler: has(/\bcreates? [^.]*\b(?:treasure|food|clue) tokens?\b/),
  },
  {
    id: "discard",
    why: "discarding cards",
    payoff: { phrase: "reward you for discarding", query: "(otag:synergy-discard or kw:madness)" },
    enabler: { phrase: "let you discard cards", query: "otag:discard-outlet" },
    isPayoff: (f) => f.keywords.has("madness") || /\bwhenever you discard\b/.test(f.lower),
    isEnabler: has(/\bdiscard (?:a|two|one or more) cards?\b/),
  },
  {
    id: "vehicles",
    why: "Vehicles",
    payoff: { phrase: "reward Vehicles", query: "otag:synergy-vehicle" },
    enabler: { phrase: "are Vehicles", query: "t:vehicle" },
    isPayoff: has(/\bvehicles? you control\b|\bwhenever [^.]*\bcrews?\b/),
    isEnabler: isType(/\bvehicle\b/),
  },
  {
    id: "big-mana",
    why: "big spells",
    payoff: { phrase: "help you cast it sooner (ramp)", query: "otag:ramp" },
    enabler: { phrase: "are big spells to ramp into", query: "mv>=6 -t:land" },
    isPayoff: (f) => f.manaValue >= 6 && !/\bland\b/.test(f.types),
    isEnabler: has(/\badd \{[wubrgc]\}|\badd (?:one|two|three) mana\b|\bsearch your library for [^.]*\bbasic land\b/),
  },
];

// Similar cards: roles ------------------------------------------------------------

/** The main thing a card does, most specific first. */
const ROLES = [
  { id: "counterspell", label: "counterspells", tag: "counterspell", test: has(/\bcounter target\b/) },
  { id: "sweeper", label: "sweepers", tag: "sweeper", test: has(/\b(?:destroy|exile) all\b|\bdeals? (?:\d+|x) damage to each creature\b|\ball creatures get -/) },
  { id: "removal", label: "creature removal", tag: "removal-creature", test: has(/\b(?:destroy|exile) target (?:[a-z]+ )?(?:creature|nonland permanent|permanent)\b|\bdeals? (?:\d+|x) damage to (?:target|any target|up to one target) [^.]*creature|\btarget creature (?:an opponent controls )?gets -\d|\bfights?\b/) },
  { id: "burn", label: "burn", tag: "burn", test: has(/\bdeals? (?:\d+|x) damage to any target\b|\bdeals? (?:\d+|x) damage to (?:each|target) (?:opponent|player)\b/) },
  { id: "edict", label: "edicts", tag: "edict", test: has(/\b(?:each opponent|target player|target opponent) sacrifices? a creature\b/) },
  { id: "tutor", label: "tutors", tag: "tutor", test: has(/\bsearch your library for (?:a|an|up to one) (?!basic land)[^.]*card\b/) },
  { id: "draw", label: "card draw", tag: "draw", test: has(/\bdraws? (?:a|two|three|four|x|that many) cards?\b/) },
  { id: "ramp", label: "ramp", tag: "ramp", test: has(/\badd \{[wubrgc]\}|\badd (?:one|two|three) mana\b|\bsearch your library for [^.]*\bland cards?\b/) },
  { id: "tokens", label: "token makers", tag: "repeatable-creature-tokens", test: has(/\bcreates? [^.]*\bcreature tokens?\b/) },
  { id: "anthem", label: "anthems", tag: "anthem", test: has(/\bcreatures you control get \+/) },
  { id: "trick", label: "combat tricks", tag: "combat-trick", test: (f) => /\binstant\b/.test(f.types) && /\btarget creature (?:you control )?gets \+/.test(f.lower) },
  { id: "lifegain", label: "life gain", tag: "lifegain", test: (f) => f.keywords.has("lifelink") || /\byou gain (?:\d+|x) life\b/.test(f.lower) },
  { id: "recursion", label: "recursion", tag: "recursion", test: has(/\breturn [^.]*\bfrom your graveyard\b/) },
];

/** The card type used for "same type" searches, from the front face. */
const MAIN_TYPES = ["creature", "planeswalker", "battle", "instant", "sorcery", "artifact", "enchantment", "land"];
function mainType(typeLine) {
  const front = (typeLine ?? "").split(" // ")[0].split("—")[0].toLowerCase();
  return MAIN_TYPES.find((t) => new RegExp(`\\b${t}\\b`).test(front)) ?? null;
}
const TYPE_PLURALS = { creature: "creatures", planeswalker: "planeswalkers", battle: "battles", instant: "instants", sorcery: "sorceries", artifact: "artifacts", enchantment: "enchantments", land: "lands" };

/** Keywords too common to make a card "similar" on their own. */
const COMMON_KEYWORDS = new Set(["flying", "trample", "vigilance", "haste", "reach", "first strike", "deathtouch", "lifelink", "menace", "defender", "flash", "equip", "enchant", "scry", "mill", "surveil", "fight"]);

function mvRange(mv) {
  const v = Math.floor(mv);
  return `mv>=${Math.max(0, v - 1)} mv<=${v + 1}`;
}

function kwTerm(k) {
  return /[\s"]/.test(k) ? `kw:"${k}"` : `kw:${k}`;
}

// Counters -------------------------------------------------------------------------

/** Answers to a card, most specific first. */
const ANSWERS = [
  { id: "hate-flying", label: "Cards that punish fliers", reason: "This creature flies. These cards are built to stop fliers.", query: "otag:hate-flying", test: (f) => /\bcreature\b/.test(f.types) && f.keywords.has("flying") },
  { id: "around-protection", label: "Sweepers and edicts", reason: "This creature has protection such as hexproof or ward, so targeted removal struggles. Sweepers and edicts don't target it.", query: "(otag:sweeper or otag:edict)", test: (f) => /\bcreature\b/.test(f.types) && ["hexproof", "ward", "shroud", "protection"].some((k) => f.keywords.has(k)) },
  { id: "exile", label: "Exile removal and edicts", reason: "This card is indestructible or comes back when it dies. Exile and edicts deal with it for good.", query: "(otag:removal-exile or otag:edict)", test: (f) => f.keywords.has("indestructible") || /\bindestructible\b|\bpersist\b|\bundying\b|\breturn ~ (?:from your graveyard )?to the battlefield\b/.test(f.lower) },
  { id: "graveyard-hate", label: "Graveyard hate", reason: "This card uses the graveyard. These cards exile graveyards or stop cards from leaving them.", query: "otag:graveyard-hate", test: (f) => THEMES.find((t) => t.id === "graveyard").isPayoff(f) },
  { id: "hate-lifegain", label: "Cards that stop life gain", reason: "This card gains life or rewards it. These cards stop players from gaining life.", query: "otag:hate-lifegain", test: (f) => THEMES.find((t) => t.id === "lifegain").isPayoff(f) },
  { id: "hate-token", label: "Answers to tokens", reason: "This card makes tokens. These cards punish tokens or clear the board.", query: "(otag:hate-token or otag:sweeper)", test: (f) => THEMES.find((t) => t.id === "go-wide").isEnabler(f) },
  { id: "removal-creature", label: "Creature removal", reason: "This is a creature. These cards destroy, exile, or damage creatures.", query: "otag:removal-creature", test: isType(/\bcreature\b/) },
  { id: "removal-planeswalker", label: "Planeswalker removal", reason: "This is a planeswalker. These cards remove or attack planeswalkers.", query: "(otag:removal-planeswalker or otag:hate-planeswalker)", test: isType(/\bplaneswalker\b/) },
  { id: "removal-enchantment", label: "Enchantment removal", reason: "This is an enchantment. These cards destroy or exile enchantments.", query: "(otag:removal-enchantment or otag:disenchant)", test: isType(/\benchantment\b/) },
  { id: "removal-artifact", label: "Artifact removal", reason: "This is an artifact. These cards destroy artifacts or punish them.", query: "(otag:removal-artifact or otag:hate-artifact)", test: isType(/\bartifact\b/) },
  { id: "removal-land", label: "Land removal", reason: "This is a land. These cards destroy lands.", query: "otag:removal-land", test: (f) => /\bland\b/.test(f.types) && !/\bbasic\b/.test(f.types) },
  { id: "counterspell", label: "Counterspells", reason: "Counterspells stop a spell before it resolves.", query: "otag:counterspell", test: (f) => !/\bland\b/.test(f.types) },
];

// Labels ---------------------------------------------------------------------------

/**
 * "Green", "White and blue", "White, blue, and black". Empty for no colors.
 * @param {string[]} colors Uppercase letters.
 */
export function colorPhrase(colors) {
  const names = COLORS.filter((c) => colors.includes(c.toUpperCase())).map((c) => COLOR_NAMES[c].toLowerCase());
  if (names.length === 0) return "";
  const text = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  return text[0].toUpperCase() + text.slice(1);
}

/** "Green cards that …", or "Cards that …" for a colorless card. */
function cardsThat(colors, phrase) {
  const c = colorPhrase(colors);
  return c ? `${c} cards that ${phrase}` : `Cards that ${phrase}`;
}

// Explore --------------------------------------------------------------------------

/**
 * Suggestions for one card.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @returns {{synergies: ExploreSuggestion[], similar: ExploreSuggestion[], counters: ExploreSuggestion[]}}
 */
export function explore(snapshot) {
  const f = facts(snapshot);
  const colors = snapshot.colorIdentity ?? [];
  const inColors = colors.length ? " Includes colorless cards, which fit any deck." : "";

  // Synergies.
  const synergies = [];
  const addSyn = (s) => {
    if (!synergies.some((x) => x.id === s.id || x.query === s.query)) synergies.push(s);
  };
  for (const t of THEMES) {
    const payoff = t.isPayoff(f);
    const enabler = t.isEnabler(f);
    if (payoff) {
      addSyn({ id: `${t.id}-more`, label: cardsThat(colors, t.payoff.phrase), reason: `This card cares about ${t.why}. These cards care about it too.${inColors}`, query: t.payoff.query, colors: "card" });
      addSyn({ id: `${t.id}-enablers`, label: cardsThat(colors, t.enabler.phrase), reason: `This card cares about ${t.why}. These cards feed it.${inColors}`, query: t.enabler.query, colors: "card" });
    } else if (enabler) {
      addSyn({ id: `${t.id}-payoffs`, label: cardsThat(colors, t.payoff.phrase), reason: `This card gives you ${t.why}. These cards reward that.${inColors}`, query: t.payoff.query, colors: "card" });
    }
  }
  for (const sub of mentionedSubtypes(f.text)) {
    addSyn({ id: `typal-${sub.toLowerCase()}`, label: `More ${pluralType(sub)}`, reason: `This card refers to ${pluralType(sub)}.`, query: `t:${sub.toLowerCase()}`, colors: "card" });
  }
  for (const sub of creatureSubtypes(snapshot.typeLine).slice(0, 2)) {
    addSyn({ id: `rewards-${sub.toLowerCase()}`, label: `Cards that reward ${pluralType(sub)}`, reason: `This card is a ${sub}. These cards reward you for having ${pluralType(sub)}.`, query: rewardsQuery(sub), colors: "card" });
  }

  // Similar cards.
  const similar = [];
  const addSim = (s) => {
    if (!similar.some((x) => x.id === s.id || x.query === s.query)) similar.push(s);
  };
  const type = mainType(snapshot.typeLine);
  const typeTerm = type ? ` t:${type}` : "";
  const typeWord = type ? TYPE_PLURALS[type] : "cards";
  for (const role of ROLES.filter((r) => r.test(f)).slice(0, 2)) {
    addSim({ id: `role-${role.id}`, label: `Other ${role.label} at about the same cost`, reason: `This card works as ${role.label}. These cards do the same job for a similar cost.`, query: `otag:${role.tag}${typeTerm} ${mvRange(f.manaValue)}`, colors: "card" });
  }
  const keywords = (snapshot.keywords ?? []).filter((k) => k && !/"/.test(k));
  const special = keywords.filter((k) => !COMMON_KEYWORDS.has(k.toLowerCase()));
  const kwSet = special.length ? special : keywords;
  if (kwSet.length) {
    const used = kwSet.slice(0, 3);
    addSim({ id: "keywords", label: `Other ${typeWord} with ${used.join(", ")}`, reason: `These ${typeWord} share this card's keywords.`, query: `${used.map((k) => kwTerm(k.toLowerCase())).join(" ")}${typeTerm}`, colors: "card" });
  }
  const subs = creatureSubtypes(snapshot.typeLine);
  if (subs.length && type === "creature") {
    addSim({ id: "subtype", label: `Other ${pluralType(subs[0])} at about the same cost`, reason: `This card is a ${subs[0]}.`, query: `t:creature t:${subs[0].toLowerCase()} ${mvRange(f.manaValue)}`, colors: "card" });
  }
  if (type && type !== "land") {
    addSim({ id: "type-cost", label: `${colorPhrase(colors) || "Colorless"} ${typeWord} that cost ${Math.floor(f.manaValue)}`, reason: "Same card type, same mana value, same colors.", query: `t:${type} mv=${Math.floor(f.manaValue)}`, colors: "card" });
  }

  // Counters.
  const counters = ANSWERS.filter((a) => a.test(f))
    .map((a) => ({ id: a.id, label: a.label, reason: a.reason, query: a.query, colors: /** @type {"any"} */ ("any") }));

  return {
    synergies: synergies.slice(0, MAX_PER_GROUP),
    similar: similar.slice(0, MAX_PER_GROUP),
    counters: counters.slice(0, MAX_PER_GROUP),
  };
}

/**
 * Criteria for one suggestion. Keeps the format, game, and rebalanced setting
 * from `base`. A "card" suggestion stays in the card's color identity (as
 * color identity in Commander and Brawl formats) and leaves the card itself
 * out of the results.
 * @param {any} base
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @param {ExploreSuggestion} suggestion
 * @returns {import("./query.js").Criteria}
 */
export function exploreCriteria(base, snapshot, suggestion) {
  const b = normalizeCriteria(base);
  const c = { ...emptyCriteria(), format: b.format, game: b.game, excludeRebalanced: b.excludeRebalanced };
  if (suggestion.colors === "card") {
    const identity = COLORS.filter((x) => (snapshot.colorIdentity ?? []).includes(x.toUpperCase()));
    if (identity.length > 0) {
      c.colorMode = "atMost";
      c.colors = identity;
      c.useIdentity = IDENTITY_FORMATS.includes(b.format ?? "");
    }
  }
  const exclude = snapshot.name && !snapshot.name.includes('"') ? ` -!"${snapshot.name}"` : "";
  c.rawQuery = `${suggestion.query}${exclude}`;
  return normalizeCriteria(c);
}
