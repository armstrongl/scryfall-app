import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSnapshot } from "../src/cards.js";
import { buildQuery, defaultCriteria } from "../src/query.js";
import {
  MAX_SUGGESTIONS, creatureSubtypes, mentionedSubtypes, pluralType, preparedText, singularType,
  suggestSynergies, synergyCriteria,
} from "../src/synergy.js";
import { fixture, snap } from "./helpers.js";

/** A snapshot of a real card from the saved search results. */
function listCard(name) {
  const card = fixture("search-list").data.find((c) => c.name === name);
  assert.ok(card, `fixture has ${name}`);
  return makeSnapshot(card, "2026-01-01T00:00:00.000Z");
}
const ids = (snapshot) => suggestSynergies(snapshot).map((s) => s.id);

test("type names: singular and plural", () => {
  assert.equal(singularType("Elves"), "Elf");
  assert.equal(singularType("Goblins"), "Goblin");
  assert.equal(singularType("Foxes"), "Fox");
  assert.equal(singularType("Fairies"), "Fairy");
  assert.equal(singularType("Goblin"), "Goblin");
  assert.equal(pluralType("Elf"), "Elves");
  assert.equal(pluralType("Werewolf"), "Werewolves");
  assert.equal(pluralType("Goblin"), "Goblins");
  assert.equal(pluralType("Fox"), "Foxes");
  assert.equal(pluralType("Merfolk"), "Merfolk");
});

test("creature subtypes come from creature and kindred faces only", () => {
  assert.deepEqual(creatureSubtypes("Creature — Goblin Warrior"), ["Goblin", "Warrior"]);
  assert.deepEqual(creatureSubtypes("Kindred Sorcery — Goblin"), ["Goblin"]);
  assert.deepEqual(creatureSubtypes("Basic Land — Forest"), []);
  assert.deepEqual(creatureSubtypes("Creature — Giant // Instant — Adventure"), ["Giant"]);
  assert.deepEqual(creatureSubtypes("Creature — Human Wizard // Creature — Human Insect"), ["Human", "Wizard", "Insect"]);
});

test("the card's own name becomes ~, and reminder text is removed", () => {
  const azog = listCard("Azog, Moria's Ruin");
  const text = preparedText(azog);
  assert.match(text, /^When ~ enters/);
  assert.doesNotMatch(text, /To amass/);
});

test("subtypes the rules text refers to", () => {
  assert.deepEqual(mentionedSubtypes(preparedText(listCard("Dropkick Bomber"))), ["Goblin"]);
  assert.deepEqual(mentionedSubtypes(preparedText(listCard("Breeches, Eager Pillager"))), ["Pirate"]);
  // "a 1/1 black Rat creature token" makes a Rat. It doesn't reward Rats.
  assert.deepEqual(mentionedSubtypes(preparedText(listCard("Redcap Gutter-Dweller"))), []);
});

test("typal card: more of the type, and rewards for it", () => {
  const s = suggestSynergies(listCard("Dropkick Bomber"));
  assert.equal(s[0].id, "typal-goblin");
  assert.equal(s[0].query, "t:goblin");
  assert.equal(s[0].label, "More Goblins");
  assert.ok(s.some((x) => x.id === "rewards-goblin"));
});

test("sacrifice outlets get creatures that do something when they die", () => {
  assert.ok(ids(listCard("Redcap Gutter-Dweller")).includes("sacrifice-fodder"));
  assert.ok(ids(listCard("Bolg's Company")).includes("sacrifice-fodder"));
  // Sacrificing an artifact is not a creature sacrifice outlet.
  assert.ok(!ids(listCard("Krenko, Baron of Tin Street")).includes("sacrifice-fodder"));
});

test("death triggers get ways to sacrifice", () => {
  assert.ok(ids(listCard("The Great Goblin")).includes("sacrifice-outlets"));
});

test("creature tokens get rewards for many creatures; Treasure counts as artifacts", () => {
  assert.ok(ids(listCard("Krenko, Mob Boss")).includes("go-wide"));
  const treasure = ids(listCard("Scuzzback Scrounger"));
  assert.ok(!treasure.includes("go-wide"));
  assert.ok(treasure.includes("artifacts"));
});

test("spells, counters, and graveyard", () => {
  const maestro = ids(listCard("Molten-Core Maestro"));
  assert.ok(maestro.includes("spells"));
  assert.ok(maestro.includes("counters"));
  assert.ok(ids(listCard("Fugitive Codebreaker")).includes("spells"));
  assert.ok(ids(listCard("Afterburner Expert")).includes("graveyard-fillers"));
  assert.ok(ids(listCard("Ultimate Green Goblin")).includes("graveyard-payoffs"));
});

test("instants and sorceries get rewards for casting spells", () => {
  assert.deepEqual(ids(snap("card-split")), ["spell-payoffs"]);
  assert.ok(ids(snap("card-mdfc")).includes("spell-payoffs"));
});

test("creatures with an enter ability get ways to use it again", () => {
  assert.ok(ids(listCard("Azog, Moria's Ruin")).includes("blink"));
});

test("a card with no patterns gets only its own types, and lands get nothing", () => {
  assert.deepEqual(ids(snap("card-normal")), ["rewards-elf", "rewards-druid"]);
  assert.deepEqual(ids(snap("card-basic-land")), []);
});

test("suggestions are unique and capped", () => {
  for (const card of fixture("search-list").data) {
    const s = suggestSynergies(makeSnapshot(card, ""));
    assert.ok(s.length <= MAX_SUGGESTIONS);
    assert.equal(new Set(s.map((x) => x.id)).size, s.length);
    assert.equal(new Set(s.map((x) => x.query)).size, s.length);
  }
});

test("every suggestion builds a query Scryfall accepts in length", () => {
  for (const card of fixture("search-list").data) {
    const snapshot = makeSnapshot(card, "");
    for (const s of suggestSynergies(snapshot)) {
      const r = buildQuery(synergyCriteria(defaultCriteria(), snapshot, s));
      assert.equal(r.error, null, `${snapshot.name}: ${s.id}`);
      assert.deepEqual(r.hints, [], `${snapshot.name}: ${s.id}`);
    }
  }
});

test("criteria keep the format, use the color identity, and leave out the card", () => {
  const snapshot = listCard("Dropkick Bomber");
  const [first] = suggestSynergies(snapshot);
  const base = { ...defaultCriteria(), types: ["creature"], mvMax: 2 };
  const c = synergyCriteria(base, snapshot, first);
  assert.equal(c.format, "standard");
  assert.equal(c.game, "arena");
  assert.equal(c.excludeRebalanced, true);
  assert.deepEqual(c.types, []);
  assert.equal(c.mvMax, null);
  assert.equal(c.colorMode, "atMost");
  assert.deepEqual(c.colors, ["r"]);
  assert.equal(c.rawQuery, 't:goblin -!"Dropkick Bomber"');
  assert.equal(buildQuery(c).query, 'f:standard game:arena -is:rebalanced c<=r (t:goblin -!"Dropkick Bomber")');
});

test("a card with no color identity sets no color filter", () => {
  const colorless = snap("card-basic-land", { colorIdentity: [] });
  const c = synergyCriteria(defaultCriteria(), colorless, { id: "x", label: "x", reason: "x", query: "t:land" });
  assert.equal(c.colorMode, "any");
  assert.deepEqual(c.colors, []);
});
