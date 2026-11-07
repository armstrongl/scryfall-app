import { test } from "node:test";
import assert from "node:assert/strict";
import { drawBatch, planCount, recentKeys, sampleFromPool } from "../src/draw.js";
import { MAX_DRAW, SMALL_POOL_SIZE } from "../src/config.js";
import { fixture, snap } from "./helpers.js";

test("count is clamped and reduced to the pool size", () => {
  assert.deepEqual(planCount(3, null), { count: 3, reduced: false });
  assert.deepEqual(planCount(50, null), { count: 30, reduced: false });
  assert.deepEqual(planCount(25, null), { count: 25, reduced: false });
  assert.deepEqual(planCount(0, null), { count: 1, reduced: false });
  assert.deepEqual(planCount(10, 4), { count: 4, reduced: true });
  assert.deepEqual(planCount(4, 4), { count: 4, reduced: false });
});

test("a batch removes duplicates by card key", async () => {
  const seq = ["a", "a", "b", "a", "c"];
  let i = 0;
  const client = { random: async () => ({ key: seq[i++] }) };
  const r = await drawBatch({ client, query: "q", count: 3, keyOf: (c) => c.key });
  assert.deepEqual(r.cards.map((c) => c.key), ["a", "b", "c"]);
  assert.equal(r.attempts, 5);
  assert.equal(r.stoppedEarly, false);
});

test("a batch stops after 3 × count attempts", async () => {
  let calls = 0;
  const client = { random: async () => { calls++; return { key: "same" }; } };
  const r = await drawBatch({ client, query: "q", count: 4, keyOf: (c) => c.key });
  assert.equal(calls, 12);
  assert.equal(r.cards.length, 1);
  assert.equal(r.stoppedEarly, true);
});

test("a batch stops when the signal is aborted", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = { random: async () => { calls++; if (calls === 2) controller.abort(); return { key: calls }; } };
  const r = await drawBatch({ client, query: "q", count: 10, keyOf: (c) => c.key, signal: controller.signal });
  assert.equal(calls, 2);
  assert.equal(r.cards.length, 2);
});

test("a draw can take up to 30 cards at once", () => {
  assert.equal(MAX_DRAW, 30);
  assert.deepEqual(planCount(30, null), { count: 30, reduced: false });
  assert.deepEqual(planCount(31, null), { count: 30, reduced: false });
});

test("small pools are one search page", () => {
  // Scryfall sends up to 175 cards a page (tests/fixtures/search-page.json).
  assert.equal(SMALL_POOL_SIZE, 175);
});

// Recency -----------------------------------------------------------------------
const item = (card, query) => ({ id: `${card.name}-${query}`, card, query, drawnAt: "2026-11-07T00:00:00.000Z" });

test("recent keys come only from draws with the same query", () => {
  const elves = snap("card-normal");
  const flyer = snap("card-flyer");
  const cobra = snap("card-landfall");
  const history = [item(elves, "t:elf"), item(flyer, "t:angel"), item(cobra, "t:elf")];
  assert.deepEqual([...recentKeys(history, "t:elf")].sort(), [elves.oracleId, cobra.oracleId].sort());
  assert.deepEqual([...recentKeys(history, "t:goblin")], []);
  assert.deepEqual([...recentKeys([], "t:elf")], []);
});

test("a batch prefers cards that weren't drawn recently", async () => {
  const seq = ["old1", "new1", "old2", "new2", "new3"];
  let i = 0;
  const client = { random: async () => ({ key: seq[i++] }) };
  const seen = [];
  const r = await drawBatch({ client, query: "q", count: 3, keyOf: (c) => c.key, recent: new Set(["old1", "old2"]), onCard: (c) => seen.push(c.key) });
  assert.deepEqual(r.cards.map((c) => c.key), ["new1", "new2", "new3"]);
  assert.deepEqual(seen, ["new1", "new2", "new3"]);
  assert.equal(r.repeats, 0);
  assert.equal(r.stoppedEarly, false);
});

test("a batch fills up with recent cards when it runs out of tries", async () => {
  // Count 2 allows 6 tries. Only one new card comes back.
  const seq = ["old1", "new1", "old1", "old2", "old2", "old1"];
  let i = 0;
  const client = { random: async () => ({ key: seq[i++] }) };
  const seen = [];
  const r = await drawBatch({ client, query: "q", count: 2, keyOf: (c) => c.key, recent: new Set(["old1", "old2"]), onCard: (c) => seen.push(c.key) });
  assert.equal(r.attempts, 6);
  assert.deepEqual(r.cards.map((c) => c.key), ["new1", "old1"]);
  assert.deepEqual(seen, ["new1", "old1"]);
  assert.equal(r.repeats, 1);
  assert.equal(r.stoppedEarly, false);
});

test("a batch with no recent cards works as before", async () => {
  const seq = ["a", "b"];
  let i = 0;
  const client = { random: async () => ({ key: seq[i++] }) };
  const r = await drawBatch({ client, query: "q", count: 2, keyOf: (c) => c.key });
  assert.deepEqual(r.cards.map((c) => c.key), ["a", "b"]);
  assert.equal(r.repeats, 0);
});

/** A repeatable random source, so the shuffle is the same every run. */
function seeded(seed = 1) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

test("sampling a small pool takes new cards first, then recent ones", () => {
  const pool = fixture("search-list").data;
  const keyOf = (c) => c.oracle_id ?? c.name;
  const recent = new Set(pool.slice(0, pool.length - 2).map(keyOf));
  const r = sampleFromPool(pool, 3, keyOf, recent, seeded());
  assert.equal(r.cards.length, Math.min(3, pool.length));
  const keys = r.cards.map(keyOf);
  assert.equal(new Set(keys).size, keys.length, "no duplicates");
  // The two cards that weren't drawn recently come first.
  assert.deepEqual(keys.slice(0, 2).sort(), pool.slice(-2).map(keyOf).sort());
  assert.equal(r.repeats, keys.length - 2);
});

test("sampling never returns more cards than the pool has, and needs no new cards", () => {
  const pool = fixture("search-list").data;
  const keyOf = (c) => c.oracle_id ?? c.name;
  const r = sampleFromPool(pool, pool.length + 5, keyOf, new Set(), seeded(7));
  assert.equal(r.cards.length, pool.length);
  assert.equal(r.repeats, 0);
  assert.deepEqual(r.cards.map(keyOf).sort(), pool.map(keyOf).sort());
});

test("sampling is random: different seeds give different orders", () => {
  const pool = fixture("search-page").data;
  const keyOf = (c) => c.oracle_id ?? c.name;
  const a = sampleFromPool(pool, 10, keyOf, new Set(), seeded(3)).cards.map(keyOf);
  const b = sampleFromPool(pool, 10, keyOf, new Set(), seeded(11)).cards.map(keyOf);
  assert.notDeepEqual(a, b);
});
