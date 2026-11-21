// The filters added after v1: popularity, age, set, number of abilities,
// creature abilities, power and toughness, what the card does, commander,
// and paper price. Every search term was checked against the live API on
// 2026-11-20; scripts/check-api.mjs runs them again.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_COUNTS, CARD_ROLES, CREATURE_KEYWORDS, POPULARITY, buildQuery, defaultCriteria, emptyCriteria,
  filterChips, filterGroupCounts, normalizeCriteria, setOptions,
} from "../src/query.js";
import { VERIFIED_TAGS } from "../src/explore.js";
import { fixture } from "./helpers.js";

const q = (changes) => buildQuery({ ...emptyCriteria(), ...changes });
const chips = (changes) => filterChips({ ...emptyCriteria(), ...changes }).map((c) => c.label);

test("new filters are off by default, so old presets don't change", () => {
  const d = defaultCriteria();
  assert.equal(d.popularity, null);
  assert.equal(d.yearMin, null);
  assert.equal(d.yearMax, null);
  assert.deepEqual(d.sets, []);
  assert.equal(d.abilityCount, null);
  assert.deepEqual(d.creatureKeywords, []);
  assert.equal(d.powMin, null);
  assert.equal(d.touMax, null);
  assert.deepEqual(d.roles, []);
  assert.equal(d.canBeCommander, false);
  assert.equal(d.priceMax, null);
  // A preset saved before these filters existed gives the same query.
  const old = { format: "standard", game: "arena", excludeRebalanced: true, colorMode: "any", colors: [], types: ["creature"] };
  assert.equal(buildQuery(old).query, "f:standard game:arena -is:rebalanced t:creature");
});

test("popularity uses the EDHREC rank", () => {
  assert.equal(q({ popularity: "staple" }).query, "edhrec<1000");
  assert.equal(q({ popularity: "popular" }).query, "edhrec<5000");
  assert.equal(q({ popularity: "spicy" }).query, "edhrec>10000");
  assert.equal(normalizeCriteria({ popularity: "hot" }).popularity, null);
  // A value from a damaged backup that only looks like a key is dropped.
  assert.equal(normalizeCriteria({ popularity: ["staple"] }).popularity, null);
  assert.equal(normalizeCriteria({ popularity: "toString" }).popularity, null);
  assert.deepEqual(Object.keys(POPULARITY), ["staple", "popular", "spicy"]);
  assert.deepEqual(chips({ popularity: "spicy" }), ["Spicy: rarely played in Commander"]);
  assert.deepEqual(chips({ popularity: "staple" }), ["Staples: top 1,000 in Commander"]);
});

test("age counts the first printing", () => {
  assert.equal(q({ yearMin: 2024 }).query, "year>=2024 not:reprint");
  assert.equal(q({ yearMax: 2015 }).query, "year<=2015 not:reprint");
  assert.equal(q({ yearMin: 2020, yearMax: 2022 }).query, "year>=2020 year<=2022 not:reprint");
  assert.equal(q({ yearMin: 2024, yearMax: 2024 }).query, "year=2024 not:reprint");
  assert.equal(normalizeCriteria({ yearMin: "2019" }).yearMin, 2019);
  assert.equal(normalizeCriteria({ yearMin: 1850 }).yearMin, null);
  assert.equal(normalizeCriteria({ yearMax: 2024.5 }).yearMax, null);
  const bad = q({ yearMin: 2024, yearMax: 2020 });
  assert.equal(bad.hints[0].field, "year");
  assert.deepEqual(chips({ yearMin: 2024 }), ["First printed 2024 or later"]);
  assert.deepEqual(chips({ yearMax: 2015 }), ["First printed 2015 or earlier"]);
  assert.deepEqual(chips({ yearMin: 2020, yearMax: 2022 }), ["First printed 2020 to 2022"]);
  assert.deepEqual(chips({ yearMin: 2024, yearMax: 2024 }), ["First printed in 2024"]);
});

test("with an age, the game filter checks the whole card, not one printing", () => {
  // Scryfall checks game: and year against the same printing, so Opt (first
  // printed in 2000, on Arena only in later sets) would be lost. in: checks
  // every printing of the card.
  assert.equal(q({ game: "arena", yearMax: 2001 }).query, "in:arena year<=2001 not:reprint");
  assert.equal(q({ game: "paper", yearMin: 2020 }).query, "in:paper year>=2020 not:reprint");
  assert.equal(q({ game: "arena" }).query, "game:arena");
  assert.equal(buildQuery({ ...defaultCriteria(), yearMin: 2025 }).query, "f:standard in:arena -is:rebalanced year>=2025 not:reprint");
});

test("with an age, set, rarity, and price look at the first printing, and a hint says so", () => {
  const hint = (c) => q(c).hints.find((h) => h.field === "year")?.message ?? "";
  assert.equal(hint({ yearMin: 2020 }), "");
  assert.equal(hint({ sets: [{ code: "fdn", name: "Foundations" }] }), "");
  assert.match(hint({ yearMin: 2020, sets: [{ code: "fdn", name: "Foundations" }] }), /first printing/);
  assert.match(hint({ yearMax: 1995, rarities: ["rare"] }), /Rarity/);
  assert.match(hint({ yearMax: 1995, priceMax: 1 }), /price/i);
  // On Arena the price isn't used, so the hint doesn't name it.
  assert.doesNotMatch(hint({ yearMax: 1995, priceMax: 1, game: "arena", sets: [{ code: "fdn", name: "F" }] }), /price/i);
});

test("sets: one or more set codes, named in plain words", () => {
  const dsk = { code: "dsk", name: "Duskmourn: House of Horror" };
  const blb = { code: "blb", name: "Bloomburrow" };
  assert.equal(q({ sets: [dsk] }).query, "e:dsk");
  assert.equal(q({ sets: [dsk, blb] }).query, "(e:dsk or e:blb)");
  assert.deepEqual(chips({ sets: [dsk] }), ["Set: Duskmourn: House of Horror"]);
  assert.deepEqual(chips({ sets: [dsk, blb] }), ["Sets: Duskmourn: House of Horror or Bloomburrow"]);
  // Bad codes are dropped, names fall back to the code, duplicates go.
  const n = normalizeCriteria({ sets: [{ code: "DSK" }, { code: "e:dsk" }, "blb", dsk, { code: "x".repeat(20) }] });
  assert.deepEqual(n.sets, [{ code: "dsk", name: "DSK" }]);
});

test("set options come from the real set list, newest first, without tokens or promos", () => {
  const options = setOptions(fixture("sets"));
  assert.ok(options.length > 100);
  const types = new Set(fixture("sets").data.filter((s) => options.some((o) => o.code === s.code)).map((s) => s.set_type));
  for (const t of ["token", "promo", "memorabilia", "minigame"]) assert.ok(!types.has(t), t);
  assert.ok(types.has("expansion") && types.has("core") && types.has("alchemy"));
  for (let i = 1; i < options.length; i++) assert.ok(options[i - 1].released >= options[i].released);
  const dsk = options.find((o) => o.code === "dsk");
  assert.deepEqual(dsk, { code: "dsk", name: "Duskmourn: House of Horror", released: "2024-09-27" });
  assert.deepEqual(setOptions(null), []);
  assert.deepEqual(setOptions({ data: "nope" }), []);
});

test("number of abilities counts paragraphs of rules text", () => {
  assert.deepEqual(ABILITY_COUNTS, ["none", "keywords", "1", "2", "3plus"]);
  assert.equal(q({ abilityCount: "none" }).query, "is:vanilla");
  assert.equal(q({ abilityCount: "keywords" }).query, "is:frenchvanilla");
  assert.equal(q({ abilityCount: "1" }).query, "o:/./ -o:/\\n/");
  assert.equal(q({ abilityCount: "2" }).query, "o:/\\n/ -o:/\\n[^\\n]*\\n/");
  assert.equal(q({ abilityCount: "3plus" }).query, "o:/\\n[^\\n]*\\n/");
  assert.equal(normalizeCriteria({ abilityCount: "7" }).abilityCount, null);
  assert.equal(normalizeCriteria({ abilityCount: ["1"] }).abilityCount, null);
  assert.deepEqual(["none", "keywords", "1", "2", "3plus"].map((a) => chips({ abilityCount: a })[0]),
    ["No abilities", "Keywords only", "1 ability", "2 abilities", "3 or more abilities"]);
});

test("creature abilities: a card must have every one ticked", () => {
  assert.ok(CREATURE_KEYWORDS.includes("flying") && CREATURE_KEYWORDS.includes("first strike"));
  assert.equal(q({ creatureKeywords: ["trample", "flying"] }).query, "kw:flying kw:trample");
  assert.equal(q({ creatureKeywords: ["first strike"] }).query, 'kw:"first strike"');
  assert.deepEqual(normalizeCriteria({ creatureKeywords: ["flying", "banding", 3] }).creatureKeywords, ["flying"]);
  assert.deepEqual(chips({ creatureKeywords: ["flying", "first strike", "lifelink"] }), ["Flying, lifelink, and first strike"]);
});

test("power and toughness ranges", () => {
  assert.equal(q({ powMin: 3, powMax: 5 }).query, "pow>=3 pow<=5");
  assert.equal(q({ touMin: 4, touMax: 4 }).query, "tou=4");
  assert.equal(q({ powMax: 1 }).query, "pow<=1");
  assert.equal(q({ powMin: 5, powMax: 2 }).hints[0].field, "pow");
  assert.equal(q({ touMin: 5, touMax: 2 }).hints[0].field, "tou");
  assert.deepEqual(chips({ powMin: 3, powMax: 5, touMin: 2 }), ["Power 3 to 5", "Toughness 2 or more"]);
});

test("what the card does uses verified Tagger tags, any of them", () => {
  for (const r of CARD_ROLES) assert.ok(VERIFIED_TAGS.includes(r.tag), r.tag);
  assert.equal(q({ roles: ["ramp"] }).query, "otag:ramp");
  assert.equal(q({ roles: ["draw", "ramp"] }).query, "(otag:ramp or otag:draw)");
  assert.deepEqual(normalizeCriteria({ roles: ["ramp", "otag:x"] }).roles, ["ramp"]);
  assert.deepEqual(chips({ roles: ["removal-creature", "draw"] }), ["Creature removal or card draw"]);
});

test("can be your commander, with Brawl's own rule in Brawl formats", () => {
  assert.equal(q({ canBeCommander: true }).query, "is:commander");
  assert.equal(q({ canBeCommander: true, format: "commander" }).query, "f:commander is:commander");
  // is:brawler adds the legendary planeswalkers that only Brawl allows.
  assert.equal(q({ canBeCommander: true, format: "brawl" }).query, "f:brawl is:brawler");
  assert.equal(q({ canBeCommander: true, format: "standardbrawl" }).query, "f:standardbrawl is:brawler");
  assert.deepEqual(chips({ canBeCommander: true }), ["Can be your commander"]);
});

test("paper price applies only when the game isn't Arena or MTGO", () => {
  assert.equal(q({ priceMax: 2 }).query, "usd<=2");
  assert.equal(q({ priceMax: 0.5, game: "paper" }).query, "game:paper usd<=0.5");
  const arena = q({ priceMax: 2, game: "arena" });
  assert.equal(arena.query, "game:arena");
  assert.equal(arena.hints[0].field, "price");
  // The chip stays, says the price isn't used, and can clear it.
  assert.deepEqual(chips({ priceMax: 2, game: "arena" }), ["On Arena", "$2 or less: not used on Arena"]);
  assert.deepEqual(chips({ priceMax: 2, game: "mtgo" }), ["On MTGO", "$2 or less: not used on MTGO"]);
  assert.deepEqual(chips({ priceMax: 2 }), ["$2 or less"]);
  assert.deepEqual(chips({ priceMax: 0.5 }), ["$0.50 or less"]);
  assert.equal(normalizeCriteria({ priceMax: -1 }).priceMax, null);
  assert.equal(normalizeCriteria({ priceMax: "1.239" }).priceMax, 1.24);
});

test("new filters follow the old ones and come before the Scryfall search", () => {
  const r = q({
    oracleText: "draw", popularity: "spicy", yearMin: 2020, sets: [{ code: "dsk", name: "Duskmourn" }],
    abilityCount: "3plus", creatureKeywords: ["flying"], powMin: 2, touMax: 3, roles: ["ramp"],
    canBeCommander: true, priceMax: 1, rawQuery: "t:elf",
  });
  assert.equal(r.query, 'o:"draw" edhrec>10000 year>=2020 not:reprint e:dsk o:/\\n[^\\n]*\\n/ kw:flying pow>=2 tou<=3 otag:ramp is:commander usd<=1 (t:elf)');
  // Every chip clears its own filter.
  const c = { ...emptyCriteria(), popularity: "spicy", yearMin: 2020, sets: [{ code: "dsk", name: "D" }], abilityCount: "1",
    creatureKeywords: ["flying"], powMin: 2, touMax: 3, roles: ["ramp"], canBeCommander: true, priceMax: 1 };
  for (const chip of filterChips(c)) {
    const left = filterChips({ ...c, ...chip.clear }).map((x) => x.id);
    assert.ok(!left.includes(chip.id), chip.id);
  }
});

test("the filter groups count their active filters", () => {
  assert.deepEqual(filterGroupCounts(defaultCriteria()), { card: 0, creature: 0, printing: 0, popularity: 0 });
  assert.deepEqual(filterGroupCounts({ ...emptyCriteria(), keyword: "flying", roles: ["ramp", "draw"], abilityCount: "1",
    creatureKeywords: ["flying"], powMin: 1, touMin: 1, sets: [{ code: "dsk", name: "D" }], yearMin: 2020, yearMax: 2021,
    popularity: "spicy", canBeCommander: true, oracleText: "x", priceMax: 3 }),
  { card: 5, creature: 3, printing: 3, popularity: 1 });
});
