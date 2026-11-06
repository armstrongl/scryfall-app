// Tests for the design overhaul modules: saved index, deck stats, browse, and
// Scryfall links. All card data comes from real fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addCard, createList } from "../src/lists.js";
import { savedIndex, savedIn } from "../src/saved.js";
import { deckStats } from "../src/stats.js";
import { SORT_OPTIONS, browseParams, mergePage, emptyBrowse } from "../src/browse.js";
import { scryfallListUrls } from "../src/links.js";
import { MAX_QUERY_LENGTH } from "../src/config.js";
import { fakeClock, fixture, snap } from "./helpers.js";

// Saved index -------------------------------------------------------------------
test("saved index finds a card in every list that has it, by oracle ID", () => {
  const clock = fakeClock();
  const elves = snap("card-normal");
  const otherPrinting = { ...elves, scryfallId: "another-printing" };
  let a = addCard(createList("Elf deck", "deck", clock), elves, { quantity: 4 }, clock);
  a = addCard(a, otherPrinting, { quantity: 1, section: "sideboard" }, clock);
  const b = addCard(createList("Wishlist", "collection", clock), elves, {}, clock);
  const c = addCard(createList("Other", "collection", clock), snap("card-flyer"), {}, clock);
  const index = savedIndex([a, b, c]);
  const found = savedIn(index, snap("card-normal"));
  assert.deepEqual(found.map((x) => x.listName).sort(), ["Elf deck", "Wishlist"]);
  assert.equal(found.find((x) => x.listName === "Elf deck").quantity, 5);
  assert.deepEqual(savedIn(index, snap("card-landfall")), []);
});

// Deck stats --------------------------------------------------------------------
test("deck stats: curve without lands, colors from mana costs, types, average", () => {
  const clock = fakeClock();
  let list = createList("Deck", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 4 }, clock); // {G}, creature, mv 1
  list = addCard(list, snap("card-flyer"), { quantity: 2 }, clock); // {3}{W}{W}, creature, mv 5
  list = addCard(list, snap("card-basic-land"), { quantity: 10 }, clock); // land
  list = addCard(list, snap("card-planeswalker"), { quantity: 1, section: "sideboard" }, clock);
  list = addCard(list, snap("card-split"), { quantity: 3, section: "maybe" }, clock);
  const s = deckStats(list.entries);
  assert.equal(s.total, 16);
  assert.equal(s.lands, 10);
  assert.equal(s.curve[1], 4);
  assert.equal(s.curve[5], 2);
  assert.equal(s.curve.reduce((a, b) => a + b, 0), 6);
  assert.equal(s.types.creature, 6);
  assert.equal(s.types.land, 10);
  assert.equal(s.pips.G, 4);
  assert.equal(s.pips.W, 4);
  assert.equal(s.averageManaValue, (4 * 1 + 2 * 5) / 6);
});

test("deck stats: 7 or more mana goes in the last curve bucket", () => {
  const clock = fakeClock();
  const big = snap("card-flyer", { manaValue: 9, scryfallId: "big" });
  const list = addCard(createList("D", "deck", clock), big, { quantity: 2 }, clock);
  const s = deckStats(list.entries);
  assert.equal(s.curve.length, 8);
  assert.equal(s.curve[7], 2);
});

// Browse ------------------------------------------------------------------------
test("sort options use Scryfall order values", () => {
  const values = SORT_OPTIONS.map((o) => o.value);
  for (const v of ["name", "cmc", "released", "rarity", "color", "edhrec", "usd", "power", "set"]) assert.ok(values.includes(v), v);
  assert.ok(SORT_OPTIONS.every((o) => typeof o.label === "string" && o.label));
});

test("browse params: order, direction, page, and unique cards", () => {
  assert.deepEqual(browseParams({ order: "cmc", dir: "desc" }, 2), { unique: "cards", order: "cmc", dir: "desc", page: 2 });
  assert.deepEqual(browseParams({ order: "nonsense", dir: "sideways" }, 1), { unique: "cards", order: "name", dir: "auto", page: 1 });
});

test("merge page: adds cards, keeps total, knows when there are more", () => {
  const page = fixture("search-page");
  const s1 = mergePage(emptyBrowse("t:goblin"), page);
  assert.equal(s1.cards.length, page.data.length);
  assert.equal(s1.total, page.total_cards);
  assert.equal(s1.hasMore, true);
  assert.equal(s1.nextPage, 2);
  // A repeated card ID (Scryfall can shift results between pages) is not added twice.
  const s2 = mergePage(s1, { ...page, has_more: false, data: page.data.slice(0, 3) });
  assert.equal(s2.cards.length, page.data.length);
  assert.equal(s2.hasMore, false);
});

// Links -------------------------------------------------------------------------
test("open a list on Scryfall: exact names, joined with or", () => {
  const urls = scryfallListUrls(["Llanowar Elves", "Serra Angel"]);
  assert.equal(urls.length, 1);
  const q = new URL(urls[0]).searchParams.get("q");
  assert.equal(q, '!"Llanowar Elves" or !"Serra Angel"');
  assert.equal(new URL(urls[0]).searchParams.get("unique"), "cards");
});

test("open a list on Scryfall: long lists split into queries under the limit, no duplicates", () => {
  const names = Array.from({ length: 120 }, (_, i) => `Card Name Number ${i}`);
  const urls = scryfallListUrls([...names, names[0]]);
  assert.ok(urls.length > 1);
  const seen = [];
  for (const u of urls) {
    const q = new URL(u).searchParams.get("q");
    assert.ok([...q].length <= MAX_QUERY_LENGTH);
    seen.push(...q.split(" or ").map((t) => t.slice(2, -1)));
  }
  assert.deepEqual(seen, names);
});

test("open a list on Scryfall: no names gives no links", () => {
  assert.deepEqual(scryfallListUrls([]), []);
});
