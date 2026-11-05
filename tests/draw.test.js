import { test } from "node:test";
import assert from "node:assert/strict";
import { drawBatch, planCount } from "../src/draw.js";

test("count is clamped and reduced to the pool size", () => {
  assert.deepEqual(planCount(3, null), { count: 3, reduced: false });
  assert.deepEqual(planCount(50, null), { count: 10, reduced: false });
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
