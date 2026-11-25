// Tests for sample opening hands and their odds (src/hand.js).
//
// The expected odds were computed outside the app, with Python's exact
// fractions: math.comb for the hypergeometric values, and, for the land
// drops, a sum over every land and spell pattern of the first 10 or 11
// cards. That is a different method from the one in src/hand.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atLeastOne, canDraw, canMulligan, drawCard, hypergeometric, landDropOdds, libraryOf, mulligan, newHand, openingOdds,
  probabilityBetween, putOnBottom,
} from "../src/hand.js";
import { HAND_SIZE } from "../src/config.js";
import { snap } from "./helpers.js";

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} is not ${expected}`);

/** A small seeded random function (mulberry32), so draws repeat. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Always the top of the range: Fisher–Yates swaps nothing, so the order stays. */
const keepOrder = () => 0.999999;

let n = 0;
const entry = (fixtureName, quantity, section = "main") => ({ id: `e${++n}`, card: snap(fixtureName), quantity, section, note: "", addedAt: "" });

/** A 60-card deck from real fixtures: 24 lands and 8 spells with mana value 2. */
function deck60() {
  return [
    entry("card-basic-land", 24), // Forest
    entry("card-landfall", 4), // Lotus Cobra, mana value 2
    entry("card-enchantress", 4), // Starfield Mystic, mana value 2
    entry("card-normal", 4), // Llanowar Elves
    entry("card-adventure", 4), // Bonecrusher Giant
    entry("card-flyer", 4), // Serra Angel
    entry("card-legendary", 4), // Krenko, Mob Boss
    entry("card-planeswalker", 4), // Teferi, Hero of Dominaria
    entry("card-split", 4), // Fire // Ice
    entry("card-transform", 4), // Delver of Secrets
    entry("card-flyer", 15, "sideboard"),
    entry("card-landfall", 3, "maybe"),
  ];
}

// Odds -------------------------------------------------------------------------------

test("hypergeometric gives the chance of exactly k hits", () => {
  close(hypergeometric(60, 24, 7, 3), 0.30870425625724157, "3 lands in 7 from 60 with 24");
  close(hypergeometric(60, 24, 7, 0), 0.02161452725911799, "no lands in 7 from 60 with 24");
  assert.equal(hypergeometric(10, 4, 3, 4), 0, "more hits than draws");
  assert.equal(hypergeometric(10, 4, 3, -1), 0);
  let sum = 0;
  for (let k = 0; k <= 7; k++) sum += hypergeometric(60, 24, 7, k);
  close(sum, 1, "the chances add up to 1");
});

test("2 to 4 lands in a 7-card hand matches independent values", () => {
  close(probabilityBetween(60, 24, 7, 2, 4), 0.7745670429727153, "60 cards, 24 lands");
  close(probabilityBetween(100, 40, 7, 2, 4), 0.7624633829283972, "100 cards, 40 lands");
  close(probabilityBetween(40, 17, 7, 2, 4), 0.7945179997811577, "40 cards, 17 lands");
});

test("a land drop each turn up to turn 4 matches independent values", () => {
  close(landDropOdds(60, 24, 4, true), 0.6317853730297425, "60/24 on the play");
  close(landDropOdds(60, 24, 4, false), 0.7259068312339482, "60/24 on the draw");
  close(landDropOdds(100, 40, 4, true), 0.6257624175369141, "100/40 on the play");
  close(landDropOdds(100, 40, 4, false), 0.7163839450854235, "100/40 on the draw");
  close(landDropOdds(40, 17, 4, true), 0.7069277714439005, "40/17 on the play");
  close(landDropOdds(40, 17, 4, false), 0.7987056535443632, "40/17 on the draw");
  // Turn 1 alone is the chance of at least one land in the opening hand.
  close(landDropOdds(60, 24, 1, true), 1 - hypergeometric(60, 24, 7, 0), "turn 1 on the play");
  assert.equal(landDropOdds(60, 0, 4, true), 0, "no lands");
  assert.equal(landDropOdds(60, 60, 4, true), 1, "all lands");
});

test("at least one card with mana value 2 by turn 2 matches independent values", () => {
  close(atLeastOne(60, 8, 8), 0.7058813338949406, "60/8, 8 cards seen on the play");
  close(atLeastOne(60, 8, 9), 0.7511303594495651, "60/8, 9 cards seen on the draw");
  close(atLeastOne(100, 10, 8), 0.5834467270072172, "100/10 on the play");
  assert.equal(atLeastOne(60, 0, 8), 0);
  assert.equal(atLeastOne(5, 2, 8), 1, "more cards seen than the deck has");
});

test("openingOdds counts the main deck only, with lands by front face", () => {
  const odds = openingOdds(deck60());
  assert.equal(odds.cards, 60);
  assert.equal(odds.lands, 24);
  assert.equal(odds.twoDrops, 8);
  close(odds.twoToFourLands, 0.7745670429727153, "2 to 4 lands");
  close(odds.landDrops.play, 0.6317853730297425, "land drops on the play");
  close(odds.landDrops.draw, 0.7259068312339482, "land drops on the draw");
  close(odds.twoDrop.play, 0.7058813338949406, "two-drop on the play");
  close(odds.twoDrop.draw, 0.7511303594495651, "two-drop on the draw");
});

test("openingOdds counts a modal double-faced spell by its front face, as deck stats do", () => {
  const odds = openingOdds([...deck60(), entry("card-mdfc", 4)]); // Shatterskull Smashing: Sorcery // Land, mana value 2
  assert.equal(odds.cards, 64);
  assert.equal(odds.lands, 24);
  assert.equal(odds.twoDrops, 12);
});

test("openingOdds is null when the main deck has fewer cards than a hand", () => {
  assert.equal(openingOdds([entry("card-basic-land", HAND_SIZE - 1)]), null);
  assert.ok(openingOdds([entry("card-basic-land", HAND_SIZE)]));
});

// The library ------------------------------------------------------------------------

test("the library has one item for each copy in the main deck, with unique IDs", () => {
  const lib = libraryOf([entry("card-legendary", 1, "commander"), ...deck60()]);
  assert.equal(lib.length, 60);
  assert.equal(new Set(lib.map((c) => c.id)).size, 60);
  assert.equal(lib.filter((c) => c.card.name === "Forest").length, 24);
  assert.equal(lib.filter((c) => c.card.name === "Krenko, Mob Boss").length, 4, "the commander stays out");
});

// Hands ------------------------------------------------------------------------------

test("a new hand draws 7 cards from a shuffled library, the same for the same seed", () => {
  const lib = libraryOf(deck60());
  const a = newHand(lib, seeded(42));
  const b = newHand(lib, seeded(42));
  const c = newHand(lib, seeded(7));
  assert.equal(a.hand.length, HAND_SIZE);
  assert.equal(a.library.length, 60 - HAND_SIZE);
  assert.deepEqual(a.hand.map((x) => x.id), b.hand.map((x) => x.id));
  assert.notDeepEqual(a.hand.map((x) => x.id), c.hand.map((x) => x.id));
  assert.deepEqual([...a.hand, ...a.library].map((x) => x.id).sort(), lib.map((x) => x.id).sort(), "no card is lost or added");
  assert.equal(a.mulligans, 0);
  assert.equal(a.toBottom, 0);
  assert.equal(a.drawn, 0);
});

test("a new hand with no shuffle takes the top 7 cards in deck order", () => {
  const lib = libraryOf(deck60());
  const s = newHand(lib, keepOrder);
  assert.deepEqual(s.hand.map((x) => x.id), lib.slice(0, HAND_SIZE).map((x) => x.id));
  assert.deepEqual(s.library.map((x) => x.id), lib.slice(HAND_SIZE).map((x) => x.id));
});

test("a small deck draws every card it has", () => {
  const s = newHand(libraryOf([entry("card-basic-land", 3)]), seeded(1));
  assert.equal(s.hand.length, 3);
  assert.equal(s.library.length, 0);
  assert.equal(canDraw(s), false);
});

test("Draw takes the top card of the library and counts it", () => {
  const s = newHand(libraryOf(deck60()), seeded(3));
  const top = s.library[0];
  const t = drawCard(s);
  assert.equal(t.hand.length, HAND_SIZE + 1);
  assert.equal(t.hand.at(-1).id, top.id);
  assert.equal(t.library.length, 60 - HAND_SIZE - 1);
  assert.equal(t.drawn, 1);
  assert.equal(s.hand.length, HAND_SIZE, "the old state is unchanged");
});

test("London mulligan: shuffle, draw 7, then put one card on the bottom for each mulligan", () => {
  const lib = libraryOf(deck60());
  let s = newHand(lib, seeded(5));
  s = mulligan(s, seeded(6));
  assert.equal(s.mulligans, 1);
  assert.equal(s.hand.length, HAND_SIZE);
  assert.equal(s.toBottom, 1);
  assert.equal(canDraw(s), false, "no draw until the cards are on the bottom");
  const chosen = s.hand[2];
  s = putOnBottom(s, chosen.id);
  assert.equal(s.hand.length, HAND_SIZE - 1);
  assert.equal(s.toBottom, 0);
  assert.equal(s.library.at(-1).id, chosen.id, "the card goes to the bottom");
  assert.equal(canDraw(s), true);

  s = mulligan(s, seeded(8));
  assert.equal(s.mulligans, 2);
  assert.equal(s.hand.length, HAND_SIZE, "a mulligan always draws 7");
  assert.equal(s.toBottom, 2);
  const first = s.hand[0];
  const second = s.hand[1];
  s = putOnBottom(putOnBottom(s, first.id), second.id);
  assert.deepEqual(s.library.slice(-2).map((x) => x.id), [first.id, second.id], "in the order chosen");
  assert.equal(s.hand.length, HAND_SIZE - 2);
  assert.deepEqual([...s.hand, ...s.library].map((x) => x.id).sort(), lib.map((x) => x.id).sort());
});

test("a mulligan shuffles every card back, the same for the same seed", () => {
  const lib = libraryOf(deck60());
  const s = newHand(lib, seeded(5));
  const a = mulligan(s, seeded(9));
  const b = mulligan(s, seeded(9));
  assert.deepEqual(a.hand.map((x) => x.id), b.hand.map((x) => x.id));
  assert.equal(a.hand.length + a.library.length, 60);
  assert.notDeepEqual(a.hand.map((x) => x.id), s.hand.map((x) => x.id), "a new hand, not the old one");
  let calls = 0;
  const counting = () => { calls++; return 0.5; };
  mulligan(s, counting);
  assert.equal(calls, 59, "one random number for each swap of a 60-card shuffle");
});

test("a card put on the bottom can come back in the next mulligan", () => {
  let s = mulligan(newHand(libraryOf(deck60()), keepOrder), keepOrder);
  const bottom = s.hand[0];
  s = putOnBottom(s, bottom.id);
  assert.equal(s.library.at(-1).id, bottom.id);
  // The first swap of Fisher–Yates trades the bottom card with the top one. Later swaps change nothing.
  let first = true;
  const t = mulligan(s, () => (first ? ((first = false), 0) : keepOrder()));
  assert.equal(t.hand[0].id, bottom.id);
  assert.ok(t.hand.some((x) => x.id === bottom.id));
});

test("in a deck smaller than a hand, a mulligan owes no more cards than the hand has", () => {
  let s = newHand(libraryOf([entry("card-basic-land", 3)]), seeded(1));
  for (let i = 1; i <= 4; i++) s = mulligan(s, seeded(i));
  assert.equal(s.hand.length, 3);
  assert.equal(s.toBottom, 3);
});

test("Put on bottom does nothing when no card is owed or the card isn't in the hand", () => {
  const s = newHand(libraryOf(deck60()), seeded(5));
  assert.equal(putOnBottom(s, s.hand[0].id), s);
  const m = mulligan(s, seeded(6));
  assert.equal(putOnBottom(m, "not-a-card"), m);
});

test("Draw does nothing while cards are owed to the bottom", () => {
  const m = mulligan(newHand(libraryOf(deck60()), seeded(5)), seeded(6));
  assert.equal(drawCard(m), m);
});

test("no mulligan after a draw", () => {
  const s = drawCard(newHand(libraryOf(deck60()), seeded(5)));
  assert.equal(canMulligan(s), false);
  assert.equal(mulligan(s, seeded(1)), s);
});

test("mulligans stop when the hand would be zero cards", () => {
  let s = newHand(libraryOf(deck60()), seeded(5));
  for (let i = 1; i <= HAND_SIZE; i++) {
    assert.equal(canMulligan(s), true, `mulligan ${i}`);
    s = mulligan(s, seeded(i));
  }
  assert.equal(s.toBottom, HAND_SIZE);
  assert.equal(canMulligan(s), false);
});

test("Brawl: the first mulligan is free, then mulligans count as usual", () => {
  let s = newHand(libraryOf(deck60()), seeded(5), { freeMulligan: true });
  s = mulligan(s, seeded(6));
  assert.equal(s.mulligans, 1);
  assert.equal(s.toBottom, 0, "the first mulligan is free");
  assert.equal(canDraw(s), true);
  s = mulligan(s, seeded(7));
  assert.equal(s.toBottom, 1);
  for (let i = 3; i <= HAND_SIZE + 1; i++) s = mulligan(s, seeded(i));
  assert.equal(s.mulligans, HAND_SIZE + 1);
  assert.equal(s.toBottom, HAND_SIZE);
  assert.equal(canMulligan(s), false);
});
