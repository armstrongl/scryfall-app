// Colors for Commander-type formats. Lands have no color, so a plain color
// filter finds almost no lands: only double-faced cards with a colored
// spell on the front. Color identity is the check these formats use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDENTITY_FORMATS, autoColorMode, buildQuery, emptyCriteria, usesIdentity } from "../src/query.js";
import { FORMAT_KEYS } from "../src/config.js";

test("Commander-type formats use color identity", () => {
  for (const f of ["commander", "oathbreaker", "brawl", "standardbrawl", "paupercommander", "duel", "predh"]) {
    assert.equal(usesIdentity(f), true, f);
  }
  for (const f of ["standard", "modern", "pauper", "historic", null, "nonsense"]) {
    assert.equal(usesIdentity(f), false, String(f));
  }
  for (const f of IDENTITY_FORMATS) assert.ok(FORMAT_KEYS.includes(f), f);
});

test("ticking a color with the mode on Any picks a mode that fits", () => {
  // With identity: cards a deck of those colors can play, colorless lands included.
  assert.equal(autoColorMode(true), "atMost");
  // Without identity: cards that have those colors.
  assert.equal(autoColorMode(false), "atLeast");
});

test("green lands for Commander: identity, at most green", () => {
  const c = { ...emptyCriteria(), format: "commander", useIdentity: true, colors: ["g"], colorMode: autoColorMode(true), types: ["land"] };
  assert.equal(buildQuery(c).query, "f:commander id<=g t:land");
});
