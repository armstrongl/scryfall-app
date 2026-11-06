// Explore: synergies, similar cards, and counters for one card. Real fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, defaultCriteria } from "../src/query.js";
import { VERIFIED_TAGS, colorPhrase, explore, exploreCriteria } from "../src/explore.js";
import { snap } from "./helpers.js";

const all = (r) => [...r.synergies, ...r.similar, ...r.counters];
const labels = (list) => list.map((s) => s.label);

test("green landfall card: more green landfall cards, and green ways to get extra lands", () => {
  const r = explore(snap("card-landfall"));
  const more = r.synergies.find((s) => s.label === "Green cards that leverage landfall");
  assert.ok(more, labels(r.synergies).join(" | "));
  assert.match(more.query, /otag:landfall/);
  assert.ok(r.synergies.some((s) => /extra lands/.test(s.label)));
});

test("white enchantment payoff: white cards that benefit from enchantments, and enchantments", () => {
  const r = explore(snap("card-enchantress"));
  const l = labels(r.synergies);
  assert.ok(l.includes("White cards that benefit from enchantments"), l.join(" | "));
  assert.ok(l.includes("White cards that are enchantments"), l.join(" | "));
});

test("Goblin token maker: Goblin rewards and go-wide payoffs", () => {
  const r = explore(snap("card-legendary"));
  const l = labels(r.synergies);
  assert.ok(l.some((x) => /Goblins/.test(x)), l.join(" | "));
  assert.ok(l.includes("Red cards that reward you for having many creatures"), l.join(" | "));
});

test("flying creature: counters include cards that punish fliers and creature removal", () => {
  const r = explore(snap("card-flyer"));
  const q = r.counters.map((s) => s.query).join(" ");
  assert.match(q, /otag:hate-flying/);
  assert.match(q, /otag:removal-creature/);
  // The most specific answer comes first.
  assert.match(r.counters[0].query, /hate-flying/);
});

test("planeswalker: counters include planeswalker removal", () => {
  const r = explore(snap("card-planeswalker"));
  assert.ok(r.counters.some((s) => /removal-planeswalker/.test(s.query)));
});

test("similar cards: same keywords, and same type at about the same cost", () => {
  const r = explore(snap("card-flyer"));
  assert.ok(r.similar.some((s) => /kw:flying/.test(s.query) && /kw:vigilance/.test(s.query)), r.similar.map((s) => s.query).join(" | "));
  assert.ok(r.similar.some((s) => /t:creature/.test(s.query) && /mv>=4/.test(s.query) && /mv<=6/.test(s.query)));
  const pw = explore(snap("card-planeswalker"));
  assert.ok(pw.similar.some((s) => /otag:draw/.test(s.query)), pw.similar.map((s) => s.query).join(" | "));
});

test("every query is well formed and uses only tags checked against the live API", () => {
  for (const name of ["card-landfall", "card-enchantress", "card-legendary", "card-flyer", "card-planeswalker", "card-normal", "card-split", "card-transform", "card-adventure", "card-mdfc", "card-basic-land"]) {
    for (const s of all(explore(snap(name)))) {
      assert.ok(s.id && s.label && s.reason && s.query, `${name}: ${JSON.stringify(s)}`);
      assert.equal((s.query.match(/\(/g) ?? []).length, (s.query.match(/\)/g) ?? []).length, s.query);
      assert.equal((s.query.match(/"/g) ?? []).length % 2, 0, s.query);
      for (const [, tag] of s.query.matchAll(/otag:([a-z0-9-]+)/g)) assert.ok(VERIFIED_TAGS.includes(tag), `${tag} in ${s.query}`);
    }
  }
});

test("ids are unique within each group", () => {
  const r = explore(snap("card-legendary"));
  for (const group of [r.synergies, r.similar, r.counters]) {
    assert.equal(new Set(group.map((s) => s.id)).size, group.length);
  }
});

test("criteria: synergies keep format and game, stay in the card's colors, and leave out the card", () => {
  const card = snap("card-landfall");
  const s = explore(card).synergies[0];
  const c = exploreCriteria(defaultCriteria(), card, s);
  assert.equal(c.format, "standard");
  assert.equal(c.game, "arena");
  assert.equal(c.colorMode, "atMost");
  assert.deepEqual(c.colors, ["g"]);
  const q = buildQuery(c).query;
  assert.match(q, /c<=g/);
  assert.match(q, /-!"Lotus Cobra"/);
});

test("criteria: counters have no color limit", () => {
  const card = snap("card-flyer");
  const s = explore(card).counters[0];
  const c = exploreCriteria(defaultCriteria(), card, s);
  assert.equal(c.colorMode, "any");
  assert.deepEqual(c.colors, []);
  assert.doesNotMatch(buildQuery(c).query, /c<=|id<=/);
});

test("criteria: in a Brawl format, colors use color identity", () => {
  const card = snap("card-landfall");
  const s = explore(card).synergies[0];
  const c = exploreCriteria({ ...defaultCriteria(), format: "brawl" }, card, s);
  assert.equal(c.useIdentity, true);
  assert.match(buildQuery(c).query, /id<=g/);
});

test("color phrases", () => {
  assert.equal(colorPhrase(["G"]), "Green");
  assert.equal(colorPhrase(["W", "U"]), "White and blue");
  assert.equal(colorPhrase(["W", "U", "B"]), "White, blue, and black");
  assert.equal(colorPhrase([]), "");
});
