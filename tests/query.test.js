import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, defaultCriteria, emptyCriteria, normalizeCriteria, scryfallSearchUrl } from "../src/query.js";
import { FORMAT_KEYS } from "../src/config.js";
import { fixture } from "./helpers.js";

const q = (changes) => buildQuery({ ...emptyCriteria(), ...changes });

test("default criteria give the documented query", () => {
  assert.equal(buildQuery(defaultCriteria()).query, "f:standard game:arena -is:rebalanced");
});

test("empty form gives an empty query", () => {
  const r = buildQuery(emptyCriteria());
  assert.equal(r.query, "");
  assert.equal(r.error, null);
  assert.deepEqual(r.hints, []);
});

test("format keys match a real Card object", () => {
  assert.deepEqual(FORMAT_KEYS, Object.keys(fixture("card-normal").legalities));
});

test("format", () => {
  assert.equal(q({ format: "standard" }).query, "f:standard");
  assert.equal(q({ format: "pioneer" }).query, "f:pioneer");
  assert.equal(q({ format: null }).query, "");
  assert.equal(normalizeCriteria({ format: "notaformat" }).format, "standard");
});

test("game", () => {
  assert.equal(q({ game: "arena" }).query, "game:arena");
  assert.equal(q({ game: "mtgo" }).query, "game:mtgo");
  assert.equal(q({ game: "paper" }).query, "game:paper");
});

test("exclude rebalanced", () => {
  assert.equal(q({ excludeRebalanced: true }).query, "-is:rebalanced");
  assert.equal(q({ excludeRebalanced: false }).query, "");
});

test("color modes and colors", () => {
  assert.equal(q({ colorMode: "exactly", colors: ["u", "w"] }).query, "c=wu");
  assert.equal(q({ colorMode: "atLeast", colors: ["w", "u"] }).query, "c>=wu");
  assert.equal(q({ colorMode: "atMost", colors: ["g", "b", "r"] }).query, "c<=brg");
  const any = q({ colorMode: "any", colors: ["w"] });
  assert.equal(any.query, "");
  assert.equal(any.hints[0].field, "colors");
  const none = q({ colorMode: "exactly", colors: [] });
  assert.equal(none.query, "");
  assert.equal(none.hints[0].field, "colors");
});

test("colorless overrides colors", () => {
  assert.equal(q({ colorless: true }).query, "c=c");
  assert.equal(q({ colorless: true, colorMode: "atLeast", colors: ["r"] }).query, "c=c");
});

test("card types", () => {
  assert.equal(q({ types: ["creature"] }).query, "t:creature");
  assert.equal(q({ types: ["instant", "creature"] }).query, "(t:creature or t:instant)");
  assert.equal(q({ types: ["battle"] }).query, "t:battle");
});

test("type line text", () => {
  assert.equal(q({ typeText: "goblin" }).query, "t:goblin");
  assert.equal(q({ typeText: "  goblin   wizard " }).query, 't:"goblin wizard"');
});

test("mana value", () => {
  assert.equal(q({ mvMin: 2, mvMax: 4 }).query, "mv>=2 mv<=4");
  assert.equal(q({ mvMin: 3, mvMax: 3 }).query, "mv=3");
  assert.equal(q({ mvMin: 0 }).query, "mv>=0");
  assert.equal(q({ mvMax: 5 }).query, "mv<=5");
  const bad = q({ mvMin: 5, mvMax: 2 });
  assert.equal(bad.query, "mv>=5 mv<=2");
  assert.equal(bad.hints[0].field, "mv");
  assert.equal(normalizeCriteria({ mvMin: 2.5 }).mvMin, null);
  assert.equal(normalizeCriteria({ mvMin: "3" }).mvMin, 3);
});

test("rarity", () => {
  assert.equal(q({ rarities: ["rare"] }).query, "r:rare");
  assert.equal(q({ rarities: ["mythic", "rare"] }).query, "(r:rare or r:mythic)");
});

test("keyword ability", () => {
  assert.equal(q({ keyword: "flying" }).query, "kw:flying");
  assert.equal(q({ keyword: "first strike" }).query, 'kw:"first strike"');
});

test("rules text is always quoted", () => {
  assert.equal(q({ oracleText: "draw a card" }).query, 'o:"draw a card"');
  assert.equal(q({ oracleText: "flash" }).query, 'o:"flash"');
});

test("raw query is wrapped in parentheses", () => {
  assert.equal(q({ rawQuery: "t:elf or t:goblin" }).query, "(t:elf or t:goblin)");
  assert.equal(
    buildQuery({ ...defaultCriteria(), rawQuery: "t:elf or t:goblin" }).query,
    "f:standard game:arena -is:rebalanced (t:elf or t:goblin)",
  );
  assert.equal(q({ rawQuery: "   " }).query, "");
});

test("free text with a double quote makes no term and gives a hint", () => {
  for (const field of ["typeText", "keyword", "oracleText"]) {
    const r = q({ [field]: 'say "hi"' });
    assert.equal(r.query, "", field);
    assert.equal(r.hints.length, 1, field);
    assert.equal(r.hints[0].field, field);
  }
  // A quote in the raw query is allowed.
  assert.equal(q({ rawQuery: 'o:"draw"' }).query, '(o:"draw")');
});

test("parts follow the order of the table", () => {
  const r = buildQuery({
    format: "standard", game: "arena", excludeRebalanced: true, colorMode: "atLeast",
    colors: ["r"], colorless: false, types: ["creature", "artifact"], typeText: "goblin",
    mvMin: 1, mvMax: 3, rarities: ["common", "uncommon"], keyword: "haste",
    oracleText: "sacrifice", rawQuery: "pow>=2",
  });
  assert.equal(
    r.query,
    'f:standard game:arena -is:rebalanced c>=r (t:artifact or t:creature) t:goblin mv>=1 mv<=3 (r:common or r:uncommon) kw:haste o:"sacrifice" (pow>=2)',
  );
});

test("length limit counts Unicode characters", () => {
  const ok = q({ rawQuery: "x".repeat(998) }); // 998 + 2 parentheses = 1000
  assert.equal([...ok.query].length, 1000);
  assert.equal(ok.error, null);
  const tooLong = q({ rawQuery: "x".repeat(999) });
  assert.match(tooLong.error, /1001 characters/);
  // An emoji is one character for Scryfall but two UTF-16 units.
  const emoji = q({ rawQuery: "😀".repeat(998) });
  assert.equal(emoji.error, null);
});

test("Open on Scryfall link encodes the query", () => {
  assert.equal(
    scryfallSearchUrl("f:standard c>=wu"),
    "https://scryfall.com/search?q=f%3Astandard%20c%3E%3Dwu",
  );
});

test("color identity: id instead of c for every color mode", () => {
  const base = { ...emptyCriteria(), useIdentity: true, colors: ["w", "g"] };
  assert.equal(buildQuery({ ...base, colorMode: "atMost" }).query, "id<=wg");
  assert.equal(buildQuery({ ...base, colorMode: "exactly" }).query, "id=wg");
  assert.equal(buildQuery({ ...base, colorMode: "atLeast" }).query, "id>=wg");
  assert.equal(buildQuery({ ...emptyCriteria(), useIdentity: true, colorless: true }).query, "id=c");
  assert.equal(normalizeCriteria({}).useIdentity, false);
  assert.equal(normalizeCriteria({ useIdentity: true }).useIdentity, true);
});

test("filter chips: one per active filter, each with what to clear", async () => {
  const { filterChips } = await import("../src/query.js");
  const chips = filterChips({ ...defaultCriteria(), colorMode: "atMost", colors: ["g", "w"], types: ["creature"], mvMin: 2, mvMax: 4, rarities: ["rare", "mythic"], rawQuery: "otag:landfall" });
  const labels = chips.map((c) => c.label);
  assert.deepEqual(labels, ["Standard", "On Arena", "No rebalanced cards", "At most white and green", "Creature", "Mana value 2 to 4", "Rare or mythic", "Raw query: otag:landfall"]);
  const raw = chips.find((c) => c.id === "rawQuery");
  assert.deepEqual(raw.clear, { rawQuery: "" });
  assert.deepEqual(filterChips(emptyCriteria()), []);
  const id = filterChips({ ...emptyCriteria(), useIdentity: true, colorMode: "exactly", colors: ["r"] });
  assert.deepEqual(id.map((c) => c.label), ["Color identity exactly red"]);
});
