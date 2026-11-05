import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeck } from "../src/deck-rules.js";
import { addCard, createList } from "../src/lists.js";
import { fakeClock, snap } from "./helpers.js";

function deck(items) {
  const clock = fakeClock();
  let list = createList("D", "deck", clock);
  for (const [card, quantity, section = "main"] of items) list = addCard(list, card, { quantity, section }, clock);
  return list;
}

const elves = snap("card-normal"); // legal
const forest = snap("card-basic-land"); // legal basic land
const codes = (r) => r.results.map((x) => x.code);

test("a legal 60-card deck has no results", () => {
  const r = checkDeck(deck([[elves, 4], [forest, 56]]));
  assert.deepEqual(r.results, []);
  assert.equal(r.mainCount, 60);
});

test("main deck under 60 gives a warning with the number needed", () => {
  const r = checkDeck(deck([[elves, 4], [forest, 50]]));
  assert.deepEqual(codes(r), ["mainSize"]);
  assert.equal(r.results[0].level, "warning");
  assert.match(r.results[0].message, /Add 6 more/);
});

test("sideboard over 15 is an error", () => {
  const r = checkDeck(deck([[elves, 4], [forest, 56], [forest, 16, "sideboard"]]));
  assert.deepEqual(codes(r), ["sideboardSize"]);
  assert.equal(r.results[0].level, "error");
  assert.equal(r.sideboardCount, 16);
});

test("more than 4 copies across main and sideboard is an error that names the card", () => {
  const otherPrinting = { ...elves, scryfallId: "another-printing" };
  const r = checkDeck(deck([[elves, 3], [otherPrinting, 1, "sideboard"], [elves, 1, "sideboard"], [forest, 57]]));
  assert.deepEqual(codes(r), ["copies"]);
  assert.equal(r.results[0].card, "Llanowar Elves");
  assert.match(r.results[0].message, /5 copies/);
});

test("a basic land with more than 4 copies has no result", () => {
  const r = checkDeck(deck([[forest, 60], [forest, 10, "sideboard"]]));
  assert.deepEqual(r.results, []);
});

test("a card that is not legal is an error that names the card and status", () => {
  const delver = snap("card-transform"); // not_legal in Standard
  const banned = snap("card-split", { standardLegality: "banned" });
  const r = checkDeck(deck([[elves, 4], [forest, 55], [delver, 1], [banned, 1, "sideboard"]]));
  assert.deepEqual(codes(r), ["legality", "legality"]);
  assert.match(r.results[0].message, /Delver of Secrets \/\/ Insectile Aberration is not legal/);
  assert.match(r.results[1].message, /Fire \/\/ Ice is banned/);
});

test("cards in maybe do not count for any check", () => {
  const delver = snap("card-transform");
  const r = checkDeck(deck([[elves, 4], [forest, 56], [elves, 10, "maybe"], [delver, 1, "maybe"], [forest, 20, "maybe"]]));
  assert.deepEqual(r.results, []);
});

test("legality as of the oldest fetchedAt in main and sideboard", () => {
  const old = snap("card-split", { fetchedAt: "2025-06-01T00:00:00.000Z", standardLegality: "legal" });
  const older = snap("card-mdfc", { fetchedAt: "2024-01-01T00:00:00.000Z" });
  const r = checkDeck(deck([[elves, 4], [old, 1, "sideboard"], [older, 1, "maybe"]]));
  assert.equal(r.legalityAsOf, "2025-06-01T00:00:00.000Z");
});
