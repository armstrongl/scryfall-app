// The Newest Standard set preset: choosing the set from the real set list,
// checking it through the queue, and the preset itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEWEST_SET_PRESET_ID, buildQuery, defaultCriteria, filterChips, localDay, newestSetPreset, setOptions,
  standardSetCandidates, standardSetCheck,
} from "../src/query.js";
import { createClient } from "../src/scryfall.js";
import { ACCEPT_HEADER, API_BASE } from "../src/config.js";
import { fixture } from "./helpers.js";

const codes = (sets) => sets.map((s) => s.code);

test("candidates are released expansions and core sets, newest first", () => {
  // The fixture lists Marvel: Darkhold Destiny (2027-04-09) and Nauctis
  // (2027-02-05) as previews, with only a few cards each.
  const sets = standardSetCandidates(fixture("sets"), "2026-11-25");
  assert.deepEqual(codes(sets), ["trk", "fra", "hob", "msh"]);
  assert.deepEqual(sets[0], { code: "trk", name: "Star Trek", released: "2026-11-13" });
});

test("a set counts from its release day, not before", () => {
  assert.equal(standardSetCandidates(fixture("sets"), "2026-11-12")[0].code, "fra");
  assert.equal(standardSetCandidates(fixture("sets"), "2026-11-13")[0].code, "trk");
});

test("candidates leave out Alchemy, Commander, Universes Beyond specials, and previews", () => {
  const all = codes(standardSetCandidates(fixture("sets"), "2026-11-25", 1000));
  // Alchemy: Reality Fracture, Star Trek Commander, The Lord of the Rings
  // (not legal in Standard), and the two preview sets.
  for (const code of ["yfra", "trc", "ltr", "mdd", "nau", "punk", "sds"]) assert.ok(!all.includes(code), code);
  for (const code of ["fdn", "dsk", "blb"]) assert.ok(all.includes(code), code);
  const types = new Set(fixture("sets").data.filter((s) => all.includes(s.code)).map((s) => s.set_type));
  assert.deepEqual([...types].sort(), ["core", "expansion"]);
});

test("candidates handle a body that isn't a set list", () => {
  assert.deepEqual(standardSetCandidates(null, "2026-11-25"), []);
  assert.deepEqual(standardSetCandidates({ data: "nope" }, "2026-11-25"), []);
});

test("the check asks for new cards from the set that are legal in Standard on Arena", () => {
  assert.equal(standardSetCheck("trk"), "e:trk f:standard game:arena not:reprint");
});

test("localDay is the date in local time", () => {
  assert.equal(localDay(new Date(2026, 10, 5, 23, 59)), "2026-11-05");
  assert.equal(localDay(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("the preset is Arena Standard with the set, named in plain words", () => {
  const p = newestSetPreset({ code: "trk", name: "Star Trek", released: "2026-11-13" });
  assert.equal(p.id, NEWEST_SET_PRESET_ID);
  assert.equal(p.name, "Newest Standard set: Star Trek");
  assert.equal(p.builtIn, true);
  assert.deepEqual(p.criteria, { ...defaultCriteria(), sets: [{ code: "trk", name: "Star Trek" }] });
  assert.equal(buildQuery(p.criteria).query, "f:standard game:arena -is:rebalanced e:trk");
  const chips = filterChips(p.criteria).map((c) => c.label);
  assert.ok(chips.includes("Set: Star Trek"), chips.join(" | "));
  for (const label of [p.name, ...chips]) assert.doesNotMatch(label, /\b(e|f|game|is):/);
});

// The client ----------------------------------------------------------------------

function virtualClock() {
  const c = { t: 0 };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.t += ms; };
  return c;
}

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A fake Scryfall: the real set list, and a random card for the given set codes. */
function fakeScryfall(legal, { fail, status } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (fail?.(calls.length)) throw new TypeError("Failed to fetch");
    const forced = status?.(calls.length);
    if (forced) return response(forced, { object: "error", status: forced, code: forced === 400 ? "bad_request" : "internal", details: "test" });
    const path = url.slice(API_BASE.length);
    if (path === "/sets") return response(200, fixture("sets"));
    const q = new URL(url).searchParams.get("q") ?? "";
    const code = /^e:(\w+) /.exec(q)?.[1];
    return legal.includes(code) ? response(200, fixture("random-standard-set")) : response(404, fixture("random-404"));
  };
  fn.calls = calls;
  return fn;
}

test("the client finds the newest set that has Standard cards on Arena, through the queue", async () => {
  const clock = virtualClock();
  const fetchImpl = fakeScryfall(["fra"]);
  const client = createClient({ fetchImpl, clock });
  const set = await client.newestStandardSet("2026-11-25");
  assert.deepEqual(set, { code: "fra", name: "Reality Fracture", released: "2026-10-02" });
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [
    `${API_BASE}/sets`,
    `${API_BASE}/cards/random?q=${encodeURIComponent("e:trk f:standard game:arena not:reprint")}`,
    `${API_BASE}/cards/random?q=${encodeURIComponent("e:fra f:standard game:arena not:reprint")}`,
  ]);
  for (const c of fetchImpl.calls) assert.equal(c.init.headers.Accept, ACCEPT_HEADER);
  assert.ok(clock.t >= 1000, "the queue spaced the requests");
});

test("the client keeps the answer for the session and shares the set list with the Set filter", async () => {
  const fetchImpl = fakeScryfall(["trk"]);
  const client = createClient({ fetchImpl, clock: virtualClock() });
  const [a, b] = await Promise.all([client.newestStandardSet("2026-11-25"), client.newestStandardSet("2026-11-25")]);
  assert.equal(a.code, "trk");
  assert.equal(b, a);
  assert.deepEqual(await client.sets(), setOptions(fixture("sets")));
  assert.equal(await client.newestStandardSet("2026-11-25"), a);
  assert.equal(fetchImpl.calls.length, 2, fetchImpl.calls.map((c) => c.url).join("\n"));
});

test("the client gives null when no recent set checks out, and stops after a few", async () => {
  const fetchImpl = fakeScryfall([]);
  const client = createClient({ fetchImpl, clock: virtualClock() });
  assert.equal(await client.newestStandardSet("2026-11-25"), null);
  assert.equal(fetchImpl.calls.length, 5);
  assert.equal(await client.newestStandardSet("2026-11-25"), null);
  assert.equal(fetchImpl.calls.length, 5, "the null answer is kept");
});

test("after a server error the client rejects without moving on to an older set", async () => {
  const fetchImpl = fakeScryfall(["trk", "fra"], { status: (n) => (n === 2 ? 500 : null) });
  const client = createClient({ fetchImpl, clock: virtualClock() });
  await assert.rejects(client.newestStandardSet("2026-11-25"), (e) => e.kind === "server");
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal((await client.newestStandardSet("2026-11-25")).code, "trk");
});

test("when Scryfall rejects the check, the client gives null and keeps it", async () => {
  const fetchImpl = fakeScryfall(["trk"], { status: (n) => (n === 2 ? 400 : null) });
  const client = createClient({ fetchImpl, clock: virtualClock() });
  assert.equal(await client.newestStandardSet("2026-11-25"), null);
  assert.equal(await client.newestStandardSet("2026-11-25"), null);
  assert.equal(fetchImpl.calls.length, 2);
});

test("after a network error the client rejects, and the next call asks again", async () => {
  const fetchImpl = fakeScryfall(["trk"], { fail: (n) => n === 2 });
  const client = createClient({ fetchImpl, clock: virtualClock() });
  await assert.rejects(client.newestStandardSet("2026-11-25"), (e) => e.kind === "network");
  assert.equal(fetchImpl.calls.length, 2, "a failed check doesn't move on to an older set");
  assert.equal((await client.newestStandardSet("2026-11-25")).code, "trk");
});
