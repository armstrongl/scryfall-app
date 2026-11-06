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

// Brawl -------------------------------------------------------------------------
function brawl(items, format = "brawl") {
  const clock = fakeClock();
  let list = createList("B", "deck", clock, format);
  for (const [card, quantity, section = "main"] of items) list = addCard(list, card, { quantity, section }, clock);
  return list;
}
// Krenko is red. These tests give it a red-green identity so a Forest fits.
const krenko = snap("card-legendary", { colorIdentity: ["R", "G"] });

test("Brawl: a legal 100-card deck with a commander has no results", () => {
  const r = checkDeck(brawl([[krenko, 1, "commander"], [elves, 1], [forest, 98]]));
  assert.deepEqual(r.results, []);
  assert.equal(r.mainCount, 100);
});

test("Brawl: deck size is 100, Standard Brawl is 60", () => {
  assert.ok(codes(checkDeck(brawl([[krenko, 1, "commander"], [forest, 59]]))).includes("mainSize"));
  const sb = checkDeck(brawl([[krenko, 1, "commander"], [forest, 59]], "standardbrawl"));
  assert.ok(!codes(sb).includes("mainSize"), codes(sb).join());
  const over = checkDeck(brawl([[krenko, 1, "commander"], [forest, 70]], "standardbrawl"));
  assert.ok(codes(over).includes("mainSize"));
});

test("Brawl: more than one copy of a card that isn't a basic land is an error", () => {
  const r = checkDeck(brawl([[krenko, 1, "commander"], [elves, 2], [forest, 97]]));
  const x = r.results.find((y) => y.code === "singleton");
  assert.ok(x);
  assert.equal(x.card, "Llanowar Elves");
});

test("Brawl: a card outside the commander's color identity is an error", () => {
  const r = checkDeck(brawl([[krenko, 1, "commander"], [snap("card-flyer"), 1], [forest, 98]]));
  const x = r.results.find((y) => y.code === "identity");
  assert.ok(x, codes(r).join());
  assert.equal(x.card, "Serra Angel");
});

test("Brawl: commander checks", () => {
  assert.ok(codes(checkDeck(brawl([[elves, 1], [forest, 99]]))).includes("commander"));
  const two = checkDeck(brawl([[krenko, 1, "commander"], [snap("card-planeswalker"), 1, "commander"], [forest, 98]]));
  assert.ok(two.results.some((x) => x.code === "commander" && x.level === "error"));
  const notLegendary = checkDeck(brawl([[snap("card-landfall"), 1, "commander"], [forest, 99]]));
  assert.ok(notLegendary.results.some((x) => x.code === "commander" && x.level === "error"));
  // A planeswalker can be a Brawl commander.
  const pw = checkDeck(brawl([[snap("card-planeswalker"), 1, "commander"]]));
  assert.ok(!pw.results.some((x) => x.code === "commander"));
});

test("Brawl: legality comes from the format's own legality", () => {
  // Teferi is legal in Brawl but not in Standard Brawl (real fixture data).
  const r = checkDeck(brawl([[snap("card-planeswalker"), 1, "commander"]], "standardbrawl"));
  assert.ok(r.results.some((x) => x.code === "legality" && x.card === "Teferi, Hero of Dominaria"));
  const old = { ...elves };
  delete old.legalities;
  const u = checkDeck(brawl([[krenko, 1, "commander"], [old, 1], [forest, 98]]));
  assert.ok(u.results.some((x) => x.code === "legalityUnknown" && x.level === "warning"));
});

test("Brawl: a sideboard gives a warning", () => {
  const r = checkDeck(brawl([[krenko, 1, "commander"], [elves, 1], [forest, 98], [snap("card-flyer"), 1, "sideboard"]]));
  assert.ok(codes(r).includes("sideboard"));
});

test("Standard: a leftover commander entry gives a warning", () => {
  const r = checkDeck(deck([[elves, 4], [forest, 56], [snap("card-legendary"), 1, "commander"]]));
  assert.ok(r.results.some((x) => x.code === "commander" && x.level === "warning"));
});

test("Brawl: a colorless commander allows basic lands of one type", () => {
  const colorless = snap("card-legendary", { colorIdentity: [] });
  const ok = checkDeck(brawl([[colorless, 1, "commander"], [forest, 99]]));
  assert.ok(!ok.results.some((x) => x.code === "identity"), ok.results.map((x) => x.message).join(" | "));
  const plains = snap("card-basic-land", { name: "Plains", frontName: "Plains", oracleId: "plains", scryfallId: "p", colorIdentity: ["W"], typeLine: "Basic Land — Plains" });
  const two = checkDeck(brawl([[colorless, 1, "commander"], [forest, 49], [plains, 50]]));
  assert.ok(two.results.some((x) => x.code === "identity"));
});

test("cards that allow up to seven copies are checked against seven", () => {
  const dwarf = snap("card-normal", { name: "Seven Dwarves", frontName: "Seven Dwarves", oracleId: "dw", scryfallId: "dw", oracleText: "Seven Dwarves gets +1/+1 for each other creature named Seven Dwarves you control.\nA deck can have up to seven cards named Seven Dwarves." });
  assert.ok(!codes(checkDeck(deck([[dwarf, 7], [forest, 53]]))).includes("copies"));
  assert.ok(codes(checkDeck(deck([[dwarf, 8], [forest, 52]]))).includes("copies"));
});
