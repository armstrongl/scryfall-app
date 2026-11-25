import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID, builtInPresets, matchingPreset } from "../src/presets.js";
import { buildQuery, defaultCriteria, filterChips, newestSetPreset, normalizeCriteria } from "../src/query.js";

const byId = (id) => BUILT_IN_PRESETS.find((p) => p.id === id);
const query = (id) => buildQuery(byId(id).criteria).query;

test("every built-in preset is marked built in, frozen, and has a unique id and name", () => {
  const ids = BUILT_IN_PRESETS.map((p) => p.id);
  const names = BUILT_IN_PRESETS.map((p) => p.name);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(names).size, names.length);
  for (const p of BUILT_IN_PRESETS) {
    assert.equal(p.builtIn, true, p.name);
    assert.ok(p.id.startsWith("builtin-"), p.id);
    assert.ok(Object.isFrozen(p), p.name);
    assert.deepEqual(normalizeCriteria(p.criteria), p.criteria, `${p.name} has normalized criteria`);
  }
});

test("Arena Standard is the default preset and gives the default search", () => {
  assert.equal(DEFAULT_PRESET_ID, "builtin-arena-standard");
  assert.equal(BUILT_IN_PRESETS[0].id, DEFAULT_PRESET_ID);
  assert.deepEqual(byId(DEFAULT_PRESET_ID).criteria, defaultCriteria());
});

test("each built-in preset gives the expected search", () => {
  assert.deepEqual(Object.fromEntries(BUILT_IN_PRESETS.map((p) => [p.name, buildQuery(p.criteria).query])), {
    "Arena Standard": "f:standard game:arena -is:rebalanced",
    "Arena Standard: non-basic lands": "f:standard game:arena -is:rebalanced t:land (-t:basic)",
    "Arena Brawl": "f:brawl game:arena -is:rebalanced",
    "Arena Brawl: non-basic lands": "f:brawl game:arena -is:rebalanced t:land (-t:basic)",
    Commander: "f:commander",
    "Commander: under $2 a card": "f:commander usd<=2",
    "Commander: staples": "f:commander edhrec<1000",
    "Commander: commanders": "f:commander is:commander",
    "Commander: non-basic lands": "f:commander t:land (-t:basic)",
    "Commander: colorless cards": "f:commander id=c (-t:land)",
  });
});

test("the Brawl and Commander presets read colors as color identity", () => {
  for (const p of BUILT_IN_PRESETS.filter((x) => /Brawl|Commander/.test(x.name))) {
    assert.equal(p.criteria.useIdentity, true, p.name);
  }
});

test("built-in presets give searches without hints or errors", () => {
  for (const p of BUILT_IN_PRESETS) {
    const r = buildQuery(p.criteria);
    assert.deepEqual(r.hints, [], p.name);
    assert.equal(r.error, null, p.name);
  }
});

test("built-in preset chips use plain words, not search syntax", () => {
  for (const p of BUILT_IN_PRESETS) {
    for (const chip of filterChips(p.criteria)) {
      assert.doesNotMatch(chip.label, /\b[a-z]+[:<>=]/, `${p.name}: ${chip.label}`);
    }
  }
  const labels = (id) => filterChips(byId(id).criteria).map((c) => c.label);
  assert.deepEqual(labels("builtin-commander-lands"), ["Commander", "Land", "Not basic lands"]);
  assert.deepEqual(labels("builtin-commander-colorless"), ["Commander", "Color identity colorless", "Not lands"]);
  assert.deepEqual(labels("builtin-commander-budget"), ["Commander", "$2 or less"]);
});

test("builtInPresets puts the Newest Standard set preset after the Arena Standard presets", () => {
  assert.deepEqual(builtInPresets(null), BUILT_IN_PRESETS);
  const newest = newestSetPreset({ code: "trk", name: "Star Trek" });
  const ids = builtInPresets(newest).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 3), ["builtin-arena-standard", "builtin-arena-standard-lands", "builtin-newest-standard"]);
  assert.equal(ids.length, BUILT_IN_PRESETS.length + 1);
});

test("matchingPreset finds the preset whose filters are the current filters", () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.equal(matchingPreset(p.criteria, BUILT_IN_PRESETS)?.id, p.id, p.name);
  }
  // Saved criteria come back through normalizeCriteria, with keys in any order.
  const stored = JSON.parse(JSON.stringify({ ...byId("builtin-commander-budget").criteria }));
  assert.equal(matchingPreset(stored, BUILT_IN_PRESETS)?.id, "builtin-commander-budget");
});

test("matchingPreset finds nothing once a filter changes", () => {
  const changed = { ...byId("builtin-commander").criteria, colors: ["g"], colorMode: "atMost" };
  assert.equal(matchingPreset(changed, BUILT_IN_PRESETS), null);
  assert.equal(matchingPreset({ ...defaultCriteria(), mvMax: 3 }, BUILT_IN_PRESETS), null);
});

test("matchingPreset finds a custom preset too, and prefers the first match", () => {
  const custom = { id: "abc", name: "Mine", builtIn: false, criteria: { ...defaultCriteria(), mvMax: 2 } };
  const list = [...BUILT_IN_PRESETS, custom];
  assert.equal(matchingPreset({ ...defaultCriteria(), mvMax: 2 }, list)?.id, "abc");
  const twin = { ...custom, id: "twin", criteria: defaultCriteria() };
  assert.equal(matchingPreset(defaultCriteria(), [...list, twin])?.id, DEFAULT_PRESET_ID);
});
