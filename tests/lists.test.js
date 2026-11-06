import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCard, applyRefresh, createList, groupBySection, removeEntry, renameList, scryfallIds,
  setFormat, setKind, sortEntries, updateEntry,
} from "../src/lists.js";
import { fakeClock, snap } from "./helpers.js";

test("create and rename", () => {
  const clock = fakeClock();
  const list = createList("  Elves ", "collection", clock);
  assert.equal(list.name, "Elves");
  assert.equal(list.kind, "collection");
  assert.equal(list.format, "standard");
  assert.deepEqual(list.entries, []);
  const renamed = renameList(list, "Green", clock);
  assert.equal(renamed.name, "Green");
  assert.ok(renamed.updatedAt > list.updatedAt);
  assert.throws(() => renameList(list, "  ", clock));
});

test("add a card", () => {
  const clock = fakeClock();
  const list = addCard(createList("A", "collection", clock), snap("card-normal"), {}, clock);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].quantity, 1);
  assert.equal(list.entries[0].section, "main");
  assert.equal(list.entries[0].note, "");
  assert.throws(() => addCard(list, snap("card-normal"), { quantity: 0 }, clock));
  assert.throws(() => addCard(list, snap("card-normal"), { quantity: 1.5 }, clock));
  assert.throws(() => addCard(list, snap("card-normal"), { section: "extra" }, clock));
});

test("adding the same printing to the same section merges", () => {
  const clock = fakeClock();
  let list = createList("A", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 2 }, clock);
  list = addCard(list, snap("card-normal"), { quantity: 3 }, clock);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].quantity, 5);
  // A different section makes a second entry.
  list = addCard(list, snap("card-normal"), { section: "sideboard" }, clock);
  assert.equal(list.entries.length, 2);
  // A different printing of the same card makes a second entry.
  list = addCard(list, snap("card-normal", { scryfallId: "other-printing" }), {}, clock);
  assert.equal(list.entries.length, 3);
});

test("change quantity, section, and note", () => {
  const clock = fakeClock();
  let list = addCard(createList("A", "deck", clock), snap("card-normal"), {}, clock);
  const id = list.entries[0].id;
  list = updateEntry(list, id, { quantity: 4, note: "Ramp" }, clock);
  assert.equal(list.entries[0].quantity, 4);
  assert.equal(list.entries[0].note, "Ramp");
  list = updateEntry(list, id, { section: "maybe" }, clock);
  assert.equal(list.entries[0].section, "maybe");
  assert.throws(() => updateEntry(list, id, { quantity: -1 }, clock));
  assert.throws(() => updateEntry(list, "missing", { quantity: 1 }, clock));
});

test("moving an entry onto the same printing merges them", () => {
  const clock = fakeClock();
  let list = createList("A", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 2 }, clock);
  list = addCard(list, snap("card-normal"), { quantity: 1, section: "sideboard" }, clock);
  const side = list.entries.find((e) => e.section === "sideboard");
  list = updateEntry(list, side.id, { section: "main" }, clock);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].quantity, 3);
});

test("remove an entry", () => {
  const clock = fakeClock();
  let list = addCard(createList("A", "deck", clock), snap("card-normal"), {}, clock);
  list = addCard(list, snap("card-split"), {}, clock);
  list = removeEntry(list, list.entries[0].id, clock);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].card.name, "Fire // Ice");
});

test("kind changes keep all entries", () => {
  const clock = fakeClock();
  let list = addCard(createList("A", "collection", clock), snap("card-normal"), { quantity: 3 }, clock);
  list = setKind(list, "deck", clock);
  assert.equal(list.kind, "deck");
  assert.equal(list.entries.length, 1);
  list = setKind(list, "collection", clock);
  assert.equal(list.kind, "collection");
  assert.equal(list.entries[0].quantity, 3);
  assert.throws(() => setKind(list, "cube", clock));
});

test("sort and group by section with totals", () => {
  const clock = fakeClock();
  let list = createList("A", "deck", clock);
  list = addCard(list, snap("card-split"), { quantity: 2 }, clock); // mv 4
  list = addCard(list, snap("card-normal"), { quantity: 4 }, clock); // mv 1
  list = addCard(list, snap("card-basic-land"), { quantity: 1, section: "maybe" }, clock);
  assert.deepEqual(sortEntries(list.entries, "name").map((e) => e.card.name), ["Fire // Ice", "Forest", "Llanowar Elves"]);
  assert.deepEqual(sortEntries(list.entries, "manaValue").map((e) => e.card.name), ["Forest", "Llanowar Elves", "Fire // Ice"]);
  assert.deepEqual(sortEntries(list.entries, "type").map((e) => e.card.name), ["Forest", "Llanowar Elves", "Fire // Ice"]);
  const groups = groupBySection(list.entries, "name");
  assert.deepEqual(groups.map((g) => [g.section, g.total]), [["main", 6], ["sideboard", 0], ["maybe", 1]]);
});

test("refresh replaces snapshots and keeps entry fields", () => {
  const clock = fakeClock();
  let list = createList("A", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 4, note: "Keep" }, clock);
  list = addCard(list, snap("card-split"), { section: "sideboard" }, clock);
  const fresh = snap("card-normal", { fetchedAt: "2026-02-01T00:00:00.000Z", standardLegality: "banned" });
  const { list: next, notFound } = applyRefresh(list, new Map([[fresh.scryfallId, fresh]]), clock);
  const elves = next.entries.find((e) => e.card.name === "Llanowar Elves");
  assert.equal(elves.card.standardLegality, "banned");
  assert.equal(elves.quantity, 4);
  assert.equal(elves.note, "Keep");
  assert.deepEqual(notFound, [snap("card-split").scryfallId]);
  assert.equal(next.entries.find((e) => e.section === "sideboard").card.fetchedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(scryfallIds(list).length, 2);
});

test("deck formats: create, change, and unknown formats", () => {
  const clock = fakeClock();
  const list = createList("B", "deck", clock, "standardbrawl");
  assert.equal(list.format, "standardbrawl");
  assert.equal(createList("C", "deck", clock).format, "standard");
  assert.equal(createList("D", "deck", clock, "nonsense").format, "standard");
  assert.equal(setFormat(list, "brawl", clock).format, "brawl");
  assert.throws(() => setFormat(list, "nonsense", clock));
});

test("a card can go in the commander section", () => {
  const clock = fakeClock();
  const list = addCard(createList("B", "deck", clock, "brawl"), snap("card-legendary"), { section: "commander" }, clock);
  assert.equal(list.entries[0].section, "commander");
});

test("restore puts a removed entry back in its place", async () => {
  const { restoreEntry } = await import("../src/lists.js");
  const clock = fakeClock();
  let list = createList("A", "deck", clock);
  list = addCard(list, snap("card-normal"), {}, clock);
  list = addCard(list, snap("card-flyer"), {}, clock);
  list = addCard(list, snap("card-landfall"), {}, clock);
  const removed = list.entries[1];
  const after = removeEntry(list, removed.id, clock);
  const back = restoreEntry(after, removed, 1, clock);
  assert.deepEqual(back.entries.map((e) => e.id), list.entries.map((e) => e.id));
  // Restoring twice doesn't make a copy.
  assert.equal(restoreEntry(back, removed, 1, clock).entries.length, 3);
});
