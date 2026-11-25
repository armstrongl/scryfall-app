import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCopy, addSections, canAddCopy, cleanDeckMode, copyRule, deckCounts, deckSummary, hiddenKeys, isInDeck, removeCopy, startingCriteria,
} from "../src/deck-mode.js";
import { addCard, createList, setKind } from "../src/lists.js";
import { buildQuery, defaultCriteria } from "../src/query.js";
import { cardKey } from "../src/cards.js";
import { fakeClock, snap } from "./helpers.js";

function deck(items, format = "standard") {
  const clock = fakeClock();
  let list = createList("D", "deck", clock, format);
  for (const [card, quantity, section = "main"] of items) list = addCard(list, card, { quantity, section }, clock);
  return list;
}

const elves = snap("card-normal"); // Llanowar Elves, green
const forest = snap("card-basic-land"); // basic land
const angel = snap("card-flyer"); // Serra Angel, white
const krenko = snap("card-legendary"); // Krenko, Mob Boss, red legend
const teferi = snap("card-planeswalker"); // Teferi, Hero of Dominaria, white and blue
// The same card as elves, in another printing.
const elvesOther = { ...elves, scryfallId: "other-printing-of-llanowar-elves" };

// Sections -----------------------------------------------------------------------

test("Standard decks add to the main deck, sideboard, or Maybe", () => {
  assert.deepEqual(addSections(deck([])), ["main", "sideboard", "maybe"]);
});

test("Brawl decks add to the main deck, commander, or Maybe", () => {
  assert.deepEqual(addSections(deck([], "brawl")), ["main", "commander", "maybe"]);
  assert.deepEqual(addSections(deck([], "standardbrawl")), ["main", "commander", "maybe"]);
});

// Counts -------------------------------------------------------------------------

test("counts add up every printing of a card, by section", () => {
  const list = deck([[elves, 2], [elvesOther, 1], [elves, 1, "sideboard"], [angel, 3]]);
  assert.deepEqual(deckCounts(list, elves), { commander: 0, main: 3, sideboard: 1, maybe: 0 });
  assert.deepEqual(deckCounts(list, elvesOther), { commander: 0, main: 3, sideboard: 1, maybe: 0 });
});

test("a card that isn't in the deck counts 0 everywhere", () => {
  assert.deepEqual(deckCounts(deck([[angel, 1]]), elves), { commander: 0, main: 0, sideboard: 0, maybe: 0 });
});

// Copy limit ---------------------------------------------------------------------

test("Standard allows 4 copies across the main deck and sideboard", () => {
  const list = deck([[elves, 3], [elves, 1, "sideboard"]]);
  assert.deepEqual(copyRule(list, elves), { limit: 4, count: 4, atLimit: true });
  assert.equal(copyRule(deck([[elves, 3]]), elves).atLimit, false);
});

test("Brawl allows 1 copy across the main deck and commander", () => {
  assert.deepEqual(copyRule(deck([[elves, 1]], "brawl"), elves), { limit: 1, count: 1, atLimit: true });
  assert.equal(copyRule(deck([[krenko, 1, "commander"]], "brawl"), krenko).atLimit, true);
  assert.equal(copyRule(deck([], "brawl"), elves).atLimit, false);
});

test("basic lands have no limit", () => {
  assert.equal(copyRule(deck([[forest, 30]]), forest).limit, Infinity);
  assert.equal(copyRule(deck([[forest, 30]], "brawl"), forest).atLimit, false);
});

test("a card whose text allows any number has no limit", () => {
  const rats = { ...elves, oracleText: "A deck can have any number of cards named Llanowar Elves." };
  assert.equal(copyRule(deck([[rats, 9]]), rats).atLimit, false);
});

test("Maybe doesn't count toward the limit, and + to Maybe is always allowed", () => {
  const list = deck([[elves, 4], [elves, 2, "maybe"]]);
  assert.equal(copyRule(list, elves).count, 4);
  const more = addCopy(list, elves, "maybe", fakeClock());
  assert.equal(deckCounts(more, elves).maybe, 3);
});

// + and − ------------------------------------------------------------------------

test("+ adds one copy to the chosen section", () => {
  const list = addCopy(deck([[elves, 1]]), elves, "main", fakeClock());
  assert.equal(deckCounts(list, elves).main, 2);
  assert.equal(list.entries.length, 1);
  const side = addCopy(list, elves, "sideboard", fakeClock());
  assert.deepEqual(deckCounts(side, elves), { commander: 0, main: 2, sideboard: 1, maybe: 0 });
});

test("+ at the copy limit changes nothing", () => {
  const list = deck([[elves, 4]]);
  assert.equal(addCopy(list, elves, "main", fakeClock()), list);
  assert.equal(addCopy(list, elves, "sideboard", fakeClock()), list);
});

test("− takes one copy from the chosen section", () => {
  const r = removeCopy(deck([[elves, 3]]), elves, "main", fakeClock());
  assert.equal(deckCounts(r.list, elves).main, 2);
  assert.equal(r.removed, null);
});

test("− at 1 removes the entry and returns it with its place, for Undo", () => {
  const list = deck([[angel, 2], [elves, 1], [forest, 10]]);
  const r = removeCopy(list, elves, "main", fakeClock());
  assert.equal(deckCounts(r.list, elves).main, 0);
  assert.equal(r.removed.entry.card.name, "Llanowar Elves");
  assert.equal(r.removed.index, 1);
});

test("− prefers the same printing, then any printing of the card", () => {
  const list = deck([[elves, 1], [elvesOther, 2]]);
  const same = removeCopy(list, elvesOther, "main", fakeClock());
  assert.equal(same.list.entries.find((e) => e.card.scryfallId === elvesOther.scryfallId).quantity, 1);
  const other = removeCopy(deck([[elvesOther, 2]]), elves, "main", fakeClock());
  assert.equal(deckCounts(other.list, elves).main, 1);
});

test("− with no copies in the section returns null", () => {
  assert.equal(removeCopy(deck([[elves, 1, "sideboard"]]), elves, "main", fakeClock()), null);
});

// Starting filters ---------------------------------------------------------------

test("a Standard deck starts Discover with Standard and the deck's colors", () => {
  const list = deck([[elves, 4], [angel, 2, "sideboard"], [forest, 10], [teferi, 1, "maybe"]]);
  const c = startingCriteria(list, { ...defaultCriteria(), format: null, types: ["creature"], colorMode: "exactly", colors: ["r"] });
  assert.equal(c.format, "standard");
  assert.equal(c.useIdentity, false);
  assert.equal(c.colorMode, "atMost");
  assert.deepEqual(c.colors, ["w", "g"]);
  assert.deepEqual(c.types, ["creature"], "other filters stay");
  assert.match(buildQuery(c).query, /f:standard/);
  assert.match(buildQuery(c).query, /c<=wg/);
});

test("a Brawl deck starts Discover with Brawl and the commander's color identity", () => {
  const list = deck([[teferi, 1, "commander"], [angel, 1]], "brawl");
  const c = startingCriteria(list, defaultCriteria());
  assert.equal(c.format, "brawl");
  assert.equal(c.useIdentity, true);
  assert.equal(c.colorMode, "atMost");
  assert.deepEqual(c.colors, ["w", "u"]);
  assert.match(buildQuery(c).query, /f:brawl/);
  assert.match(buildQuery(c).query, /id<=wu/);
});

test("a deck with no cards to read colors from clears the color filter", () => {
  const brawl = startingCriteria(deck([[angel, 1]], "standardbrawl"), { ...defaultCriteria(), colorMode: "exactly", colors: ["r"] });
  assert.equal(brawl.format, "standardbrawl");
  assert.equal(brawl.useIdentity, true);
  assert.equal(brawl.colorMode, "any");
  assert.deepEqual(brawl.colors, []);
  const empty = startingCriteria(deck([]), { ...defaultCriteria(), colorless: true });
  assert.equal(empty.colorMode, "any");
  assert.equal(empty.colorless, false);
});

test("a deck of colorless cards and basic lands clears the color filter", () => {
  const c = startingCriteria(deck([[forest, 20]]), defaultCriteria());
  assert.equal(c.colorMode, "any");
  assert.deepEqual(c.colors, []);
});

// Hiding ---------------------------------------------------------------------------

test("cards in the main deck, commander, or sideboard are in the deck; Maybe isn't", () => {
  const list = deck([[elves, 1], [angel, 1, "sideboard"], [teferi, 1, "maybe"]]);
  assert.equal(isInDeck(list, elvesOther), true);
  assert.equal(isInDeck(list, angel), true);
  assert.equal(isInDeck(list, teferi), false);
  assert.equal(isInDeck(list, krenko), false);
  assert.equal(isInDeck(deck([[krenko, 1, "commander"]], "brawl"), krenko), true);
});

test("hiddenKeys gives the card keys to hide, only when hiding is on", () => {
  const list = deck([[elves, 1], [angel, 1, "sideboard"], [teferi, 1, "maybe"]]);
  const keys = hiddenKeys(list, true);
  assert.ok(keys.has(cardKey(elvesOther)), "every printing of a card in the deck");
  assert.ok(keys.has(cardKey(angel)));
  assert.ok(!keys.has(cardKey(teferi)), "Maybe stays shown");
  assert.equal(hiddenKeys(list, false).size, 0);
  assert.equal(hiddenKeys(null, true).size, 0);
});

// Summary --------------------------------------------------------------------------

test("the summary gives the count, the size, and the problems", () => {
  const s = deckSummary(deck([[elves, 4], [forest, 54]]));
  assert.deepEqual(s, { count: 58, size: 60, problems: 0 });
  const bad = deckSummary(deck([[elves, 5], [krenko, 1]]));
  assert.equal(bad.count, 6);
  assert.ok(bad.problems >= 1, "five copies is a problem");
});

test("the count of a Brawl deck counts the commander, and the size is the format's", () => {
  const s = deckSummary(deck([[krenko, 1, "commander"], [forest, 98]], "brawl"));
  assert.equal(s.count, 99);
  assert.equal(s.size, 100);
  assert.equal(deckSummary(deck([], "standardbrawl")).size, 60);
});

// The stored choice ----------------------------------------------------------------

test("cleanDeckMode keeps a valid choice", () => {
  const list = { ...deck([]), id: "d1" };
  assert.deepEqual(cleanDeckMode({ listId: "d1", section: "sideboard", hide: true }, [list]), { listId: "d1", section: "sideboard", hide: true });
});

test("cleanDeckMode gives defaults for a bad section or hide value", () => {
  const list = { ...deck([], "brawl"), id: "d1" };
  assert.deepEqual(cleanDeckMode({ listId: "d1", section: "sideboard", hide: "yes" }, [list]), { listId: "d1", section: "main", hide: false });
});

test("cleanDeckMode drops a deck that is gone or is a collection", () => {
  const list = { ...deck([]), id: "d1" };
  assert.equal(cleanDeckMode({ listId: "gone", section: "main", hide: false }, [list]), null);
  assert.equal(cleanDeckMode({ listId: "d1", section: "main", hide: false }, [setKind(list, "collection")]), null);
  assert.equal(cleanDeckMode(null, [list]), null);
  assert.equal(cleanDeckMode("d1", [list]), null);
});

test("canAddCopy checks the limit for Undo too: a card added back another way can't be restored past it", () => {
  const list = deck([[krenko, 1]], "brawl");
  assert.equal(canAddCopy(list, krenko, "main"), false);
  assert.equal(canAddCopy(list, krenko, "maybe"), true);
});
