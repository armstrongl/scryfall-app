import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, errorMessage, mapErrorResponse } from "../src/scryfall.js";
import { ACCEPT_HEADER, API_BASE } from "../src/config.js";
import { fixture } from "./helpers.js";

/** A fake clock: sleep moves virtual time forward at once. */
function virtualClock() {
  const c = { t: 0, sleeps: [] };
  c.now = () => c.t;
  c.sleep = async (ms) => {
    c.sleeps.push(ms);
    c.t += ms;
  };
  return c;
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A fake fetch that records the virtual start time of each call. */
function fakeFetch(clock, respond = () => response(200, { object: "card" })) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, at: clock.now() });
    return respond(calls.length, url, init);
  };
  fn.calls = calls;
  return fn;
}

test("sends the Accept header and no User-Agent", async () => {
  const clock = virtualClock();
  const fetchImpl = fakeFetch(clock);
  const client = createClient({ fetchImpl, clock });
  await client.random("f:standard");
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, `${API_BASE}/cards/random?q=f%3Astandard`);
  assert.equal(init.headers.Accept, ACCEPT_HEADER);
  assert.equal(init.headers["User-Agent"], undefined);
});

test("requests start at least 500 ms apart, one at a time", async () => {
  const clock = virtualClock();
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = fakeFetch(clock, async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    clock.t += 120; // The request takes time.
    inFlight--;
    return response(200, { object: "card" });
  });
  const client = createClient({ fetchImpl, clock });
  await Promise.all(Array.from({ length: 10 }, () => client.random("x")));
  assert.equal(fetchImpl.calls.length, 10);
  assert.equal(maxInFlight, 1);
  for (let i = 1; i < 10; i++) {
    assert.ok(fetchImpl.calls[i].at - fetchImpl.calls[i - 1].at >= 500, `gap ${i}`);
  }
});

test("a 429 pauses all requests for 30 seconds, then retries once", async () => {
  const clock = virtualClock();
  const pauses = [];
  const fetchImpl = fakeFetch(clock, (n) => (n === 1 ? response(429, { object: "error", status: 429, code: "rate_limited", details: "slow" }) : response(200, { object: "card", n })));
  const client = createClient({ fetchImpl, clock, onPauseChange: (u) => pauses.push(u) });
  const [a, b] = await Promise.all([client.random("a"), client.random("b")]);
  assert.equal(a.n, 2); // The same request was sent again.
  assert.equal(b.n, 3);
  assert.equal(fetchImpl.calls[1].url, fetchImpl.calls[0].url);
  assert.ok(fetchImpl.calls[1].at - fetchImpl.calls[0].at >= 30_000);
  assert.ok(fetchImpl.calls[2].at - fetchImpl.calls[1].at >= 500);
  assert.equal(pauses[0], 30_000);
  assert.equal(pauses[1], null);
});

test("a second 429 rejects the request without another retry", async () => {
  const clock = virtualClock();
  const fetchImpl = fakeFetch(clock, () => response(429, { object: "error", status: 429, code: "rate_limited", details: "" }));
  const client = createClient({ fetchImpl, clock });
  await assert.rejects(client.random("a"), (e) => e.kind === "rateLimited");
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(errorMessage(mapErrorResponse(429, null)), "Scryfall paused requests. Wait 30 seconds, then try again.");
});

test("cancel stops queued requests that have not started", async () => {
  const clock = virtualClock();
  const controller = new AbortController();
  const fetchImpl = fakeFetch(clock, (n) => {
    if (n === 2) controller.abort();
    return response(200, { object: "card", n });
  });
  const client = createClient({ fetchImpl, clock });
  const other = client.random("other"); // Not part of the batch.
  const batch = Array.from({ length: 5 }, () => client.random("batch", controller.signal));
  const results = await Promise.allSettled([other, ...batch]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "fulfilled"); // Started before the cancel.
  for (const r of results.slice(2)) {
    assert.equal(r.status, "rejected");
    assert.equal(r.reason.kind, "cancelled");
  }
  assert.equal(fetchImpl.calls.length, 2);
  // A request with a signal that is already aborted never starts.
  await assert.rejects(client.random("x", controller.signal), (e) => e.kind === "cancelled");
  assert.equal(fetchImpl.calls.length, 2);
});

test("error mapping uses real responses", () => {
  const notFound = mapErrorResponse(404, fixture("random-404"));
  assert.equal(notFound.kind, "notFound");
  assert.equal(errorMessage(notFound), "No cards match these criteria. Remove a filter and try again.");
  const search404 = mapErrorResponse(404, fixture("search-404"));
  assert.equal(search404.kind, "notFound");
  const bad = mapErrorResponse(400, fixture("search-bad-request"));
  assert.equal(bad.kind, "badRequest");
  assert.ok(bad.warnings.length > 0);
  assert.equal(errorMessage(bad), [bad.details, ...bad.warnings].join(" "));
  assert.equal(mapErrorResponse(503, null).kind, "server");
  assert.equal(errorMessage(mapErrorResponse(500, null)), "Scryfall is not available. Try again later.");
  assert.equal(mapErrorResponse(404, { object: "error", code: "other" }).kind, "badRequest");
});

test("network failure maps to a network error", async () => {
  const clock = virtualClock();
  const client = createClient({ clock, fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(client.random("a"), (e) => e.kind === "network");
  assert.equal(errorMessage({ kind: "network" }), "Can't connect to Scryfall. Check your connection and try again.");
});

test("collection sends at most 75 identifiers per request, spaced by the queue", async () => {
  const clock = virtualClock();
  const fetchImpl = fakeFetch(clock, (n, url, init) => {
    const ids = JSON.parse(init.body).identifiers;
    return response(200, { object: "list", not_found: n === 2 ? [ids[0]] : [], data: ids.slice(n === 2 ? 1 : 0).map((x) => ({ id: x.id })) });
  });
  const client = createClient({ fetchImpl, clock });
  const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
  const res = await client.collection(ids);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).identifiers.length, 75);
  assert.equal(JSON.parse(fetchImpl.calls[1].init.body).identifiers.length, 25);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body).identifiers[0], { id: "id-0" });
  assert.equal(fetchImpl.calls[0].init.method, "POST");
  assert.equal(fetchImpl.calls[0].init.headers["Content-Type"], "application/json");
  assert.ok(fetchImpl.calls[1].at - fetchImpl.calls[0].at >= 500);
  assert.equal(res.data.length, 99);
  assert.deepEqual(res.notFound, [{ id: "id-75" }]);
});

test("the real collection fixture lists unknown IDs in not_found", () => {
  const res = fixture("collection-not-found");
  assert.equal(res.data.length, 1);
  assert.equal(res.not_found.length, 1);
  assert.ok(res.not_found[0].id);
});

test("search sends order, direction, and page; rulings use the card's ID", async () => {
  const clock = virtualClock();
  const fetchImpl = fakeFetch(clock, () => response(200, { object: "list", data: [] }));
  const client = createClient({ fetchImpl, clock });
  await client.search("t:goblin", { unique: "cards", order: "cmc", dir: "desc", page: 2 });
  assert.equal(fetchImpl.calls[0].url, `${API_BASE}/cards/search?q=t%3Agoblin&unique=cards&order=cmc&dir=desc&page=2`);
  await client.rulings("abc-123");
  assert.equal(fetchImpl.calls[1].url, `${API_BASE}/cards/abc-123/rulings`);
  assert.equal(fetchImpl.calls[1].init.headers.Accept, ACCEPT_HEADER);
});
