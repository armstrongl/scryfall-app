// Short explanations of keywords, keyword actions, ability words, and common
// tokens. Pure module. Each text follows the card's reminder text or the
// Comprehensive Rules (https://magic.wizards.com/en/rules), shortened. The
// app links each term to the MTG Wiki and shows the card's official rulings
// from Scryfall, so this text is a quick start, not the rules.

/**
 * @typedef {{name: string, kind: "keyword"|"action"|"ability word"|"token", text: string}} GlossaryEntry
 */

/** @type {GlossaryEntry[]} */
const ENTRIES = [
  // Evergreen keyword abilities.
  { name: "Deathtouch", kind: "keyword", text: "Any amount of damage this deals to a creature is enough to destroy it." },
  { name: "Defender", kind: "keyword", text: "This creature can't attack." },
  { name: "Double strike", kind: "keyword", text: "This creature deals both first-strike and regular combat damage." },
  { name: "Enchant", kind: "keyword", text: "An Aura's enchant ability says what the Aura can be attached to." },
  { name: "Equip", kind: "keyword", text: "Pay the equip cost: attach this Equipment to target creature you control. Equip only as a sorcery." },
  { name: "First strike", kind: "keyword", text: "This creature deals combat damage before creatures without first strike." },
  { name: "Flash", kind: "keyword", text: "You may cast this spell any time you could cast an instant." },
  { name: "Flying", kind: "keyword", text: "This creature can't be blocked except by creatures with flying or reach." },
  { name: "Haste", kind: "keyword", text: "This creature can attack and use {T} abilities as soon as it comes under your control." },
  { name: "Hexproof", kind: "keyword", text: "This can't be the target of spells or abilities your opponents control." },
  { name: "Indestructible", kind: "keyword", text: "Damage and effects that say \"destroy\" don't destroy this." },
  { name: "Lifelink", kind: "keyword", text: "Damage dealt by this also causes its controller to gain that much life." },
  { name: "Menace", kind: "keyword", text: "This creature can't be blocked except by two or more creatures." },
  { name: "Protection", kind: "keyword", text: "Protection from a quality means this can't be blocked, targeted, dealt damage, enchanted, or equipped by anything with that quality." },
  { name: "Reach", kind: "keyword", text: "This creature can block creatures with flying." },
  { name: "Trample", kind: "keyword", text: "This creature can deal excess combat damage to the player or planeswalker it's attacking." },
  { name: "Vigilance", kind: "keyword", text: "Attacking doesn't cause this creature to tap." },
  { name: "Ward", kind: "keyword", text: "Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost." },

  // Other keyword abilities.
  { name: "Affinity", kind: "keyword", text: "This spell costs {1} less to cast for each permanent of the named kind you control, such as each artifact." },
  { name: "Bargain", kind: "keyword", text: "You may sacrifice an artifact, enchantment, or token as you cast this spell. If you do, it has an extra effect." },
  { name: "Convoke", kind: "keyword", text: "Your creatures can help cast this spell. Each creature you tap while casting it pays for {1} or one mana of that creature's color." },
  { name: "Crew", kind: "keyword", text: "Tap any number of other untapped creatures you control with total power equal to the crew number or more: this Vehicle becomes an artifact creature until end of turn." },
  { name: "Cycling", kind: "keyword", text: "Pay the cycling cost and discard this card: draw a card." },
  { name: "Escape", kind: "keyword", text: "You may cast this card from your graveyard by paying its escape cost, which usually includes exiling other cards from your graveyard." },
  { name: "Flashback", kind: "keyword", text: "You may cast this card from your graveyard for its flashback cost. Then exile it." },
  { name: "Harmonize", kind: "keyword", text: "You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by its power. Then exile this spell." },
  { name: "Improvise", kind: "keyword", text: "Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}." },
  { name: "Kicker", kind: "keyword", text: "You may pay an additional cost as you cast this spell. If you do, it has an extra effect." },
  { name: "Madness", kind: "keyword", text: "If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard." },
  { name: "Mobilize", kind: "keyword", text: "Whenever this creature attacks, create that many tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step." },
  { name: "Offspring", kind: "keyword", text: "You may pay an additional cost as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it." },
  { name: "Plot", kind: "keyword", text: "You may pay the plot cost and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost." },
  { name: "Prowess", kind: "keyword", text: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn." },
  { name: "Saddle", kind: "keyword", text: "Tap any number of other untapped creatures you control with total power equal to the saddle number or more: this Mount becomes saddled until end of turn. Saddle only as a sorcery." },
  { name: "Spree", kind: "keyword", text: "Choose one or more modes as you cast this spell. Each mode you choose adds its own cost." },
  { name: "Toxic", kind: "keyword", text: "Players dealt combat damage by this creature also get that many poison counters. A player with ten or more poison counters loses the game." },
  { name: "Gift", kind: "keyword", text: "As you cast this spell, you may promise an opponent a gift. If you do, they get the gift, and the spell has an extra effect." },
  { name: "Exhaust", kind: "keyword", text: "An exhaust ability can be activated only once." },

  // Keyword actions.
  { name: "Scry", kind: "action", text: "Look at that many cards from the top of your library. Put any number of them on the bottom and the rest on top in any order." },
  { name: "Surveil", kind: "action", text: "Look at that many cards from the top of your library. Put any number of them into your graveyard and the rest on top in any order." },
  { name: "Mill", kind: "action", text: "Put that many cards from the top of your library into your graveyard." },
  { name: "Fight", kind: "action", text: "Each of the two creatures deals damage equal to its power to the other." },
  { name: "Proliferate", kind: "action", text: "Choose any number of permanents and players, then give each another counter of each kind already there." },
  { name: "Explore", kind: "action", text: "Reveal the top card of your library. If it's a land, put it into your hand. If not, put a +1/+1 counter on this creature, then you may put the revealed card into your graveyard." },
  { name: "Connive", kind: "action", text: "Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature." },
  { name: "Investigate", kind: "action", text: "Create a Clue token. It's an artifact with \"{2}, Sacrifice this artifact: Draw a card.\"" },
  { name: "Adapt", kind: "action", text: "If this creature has no +1/+1 counters on it, put that many +1/+1 counters on it." },
  { name: "Amass", kind: "action", text: "Put that many +1/+1 counters on an Army you control. If you don't control one, create a 0/0 Army creature token first." },
  { name: "Discover", kind: "action", text: "Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order." },
  { name: "Manifest dread", kind: "action", text: "Look at the top two cards of your library. Put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. You may turn it face up for its mana cost if it's a creature card." },
  { name: "Forage", kind: "action", text: "Exile three cards from your graveyard or sacrifice a Food." },
  { name: "Collect evidence", kind: "action", text: "Exile cards with total mana value of that number or more from your graveyard." },
  { name: "Endure", kind: "action", text: "Put that many +1/+1 counters on this creature, or create a white Spirit creature token with that power and toughness." },

  // Ability words. They have no rules meaning of their own. They name abilities that work alike.
  { name: "Landfall", kind: "ability word", text: "Landfall abilities trigger whenever a land you control enters the battlefield." },
  { name: "Constellation", kind: "ability word", text: "Constellation abilities trigger whenever an enchantment you control enters the battlefield." },
  { name: "Magecraft", kind: "ability word", text: "Magecraft abilities trigger whenever you cast or copy an instant or sorcery spell." },
  { name: "Raid", kind: "ability word", text: "Raid abilities do more if you attacked this turn." },
  { name: "Threshold", kind: "ability word", text: "Threshold abilities work as long as seven or more cards are in your graveyard." },
  { name: "Delirium", kind: "ability word", text: "Delirium abilities work as long as there are four or more card types among cards in your graveyard." },
  { name: "Celebration", kind: "ability word", text: "Celebration abilities work if two or more nonland permanents entered the battlefield under your control this turn." },
  { name: "Valiant", kind: "ability word", text: "Valiant abilities trigger whenever this creature becomes the target of a spell or ability you control for the first time each turn." },
  { name: "Flurry", kind: "ability word", text: "Flurry abilities trigger whenever you cast your second spell each turn." },
  { name: "Survival", kind: "ability word", text: "Survival abilities trigger at the beginning of your second main phase if this creature is tapped." },

  // Tokens named in rules text.
  { name: "Treasure", kind: "token", text: "A Treasure is an artifact token with \"{T}, Sacrifice this artifact: Add one mana of any color.\"" },
  { name: "Food", kind: "token", text: "A Food is an artifact token with \"{2}, {T}, Sacrifice this artifact: You gain 3 life.\"" },
  { name: "Clue", kind: "token", text: "A Clue is an artifact token with \"{2}, Sacrifice this artifact: Draw a card.\"" },
];

/** Entries by lowercase name. */
export const GLOSSARY = Object.freeze(Object.fromEntries(ENTRIES.map((e) => [e.name.toLowerCase(), Object.freeze(e)])));

/** @param {string} term @returns {GlossaryEntry|null} */
export function lookup(term) {
  return GLOSSARY[String(term ?? "").toLowerCase()] ?? null;
}

/** The MTG Wiki page for a term. */
export function wikiUrl(term) {
  return `https://mtg.fandom.com/wiki/${encodeURIComponent(String(term).replace(/ /g, "_"))}`;
}

const TOKENS = ["Treasure", "Food", "Clue"];

/**
 * Terms for one card: its keywords from Scryfall, in order, then tokens its
 * rules text creates. A keyword with no entry has `text: null`.
 * @param {import("./cards.js").CardSnapshot} snapshot
 * @returns {{name: string, kind: string|null, text: string|null}[]}
 */
export function glossaryFor(snapshot) {
  const out = [];
  const seen = new Set();
  for (const k of snapshot.keywords ?? []) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const e = lookup(k);
    out.push(e ? { name: e.name, kind: e.kind, text: e.text } : { name: k, kind: null, text: null });
  }
  for (const t of TOKENS) {
    if (seen.has(t.toLowerCase())) continue;
    if (new RegExp(`\\b${t} tokens?\\b`).test(snapshot.oracleText ?? "")) {
      seen.add(t.toLowerCase());
      const e = lookup(t);
      out.push({ name: e.name, kind: e.kind, text: e.text });
    }
  }
  return out;
}
