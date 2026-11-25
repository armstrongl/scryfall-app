// Sample opening hands and the odds of a good start. Pure module: no DOM,
// network, or storage. The random function is passed in, so tests can use a
// seeded one.
//
// Mulligans follow the London mulligan in the Comprehensive Rules, rule
// 103.5: shuffle the hand back, draw a new hand of 7, then put one card on
// the bottom for each mulligan. Rule 103.5c makes the first mulligan free in
// any Brawl game. MTG Arena's best-of-one hand shuffler is not modeled,
// because Wizards hasn't published how it chooses a hand.

import { HAND_SIZE } from "./config.js";
import { shuffled } from "./draw.js";
import { primaryType } from "./stats.js";

// Odds -------------------------------------------------------------------------------

/** n choose k, exact. */
function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
  return r;
}

/**
 * The chance of exactly k hits in n cards drawn from N cards with K hits
 * (the hypergeometric distribution).
 */
export function hypergeometric(N, K, n, k) {
  if (k < 0 || k > n || k > K || n - k > N - K || n > N) return 0;
  return Number(choose(K, k) * choose(N - K, n - k)) / Number(choose(N, n));
}

/** The chance of lo to hi hits, both included, in n cards. */
export function probabilityBetween(N, K, n, lo, hi) {
  let p = 0;
  for (let k = Math.max(0, lo); k <= hi; k++) p += hypergeometric(N, K, n, k);
  return p;
}

/** The chance of at least one hit in n cards. A deck smaller than n is drawn whole. */
export function atLeastOne(N, K, n) {
  return 1 - hypergeometric(N, K, Math.min(n, N), 0);
}

/**
 * The chance of a land to play on each turn from 1 to `turns`: by turn t,
 * at least t lands among the cards seen. On the play, turn t has seen
 * 7 + t − 1 cards. On the draw, one more. It follows the count of lands
 * one card at a time, because each turn depends on the turns before it.
 * @param {number} N Cards in the deck.
 * @param {number} K Lands in the deck.
 * @param {number} turns
 * @param {boolean} onThePlay
 */
export function landDropOdds(N, K, turns, onThePlay) {
  const first = HAND_SIZE + (onThePlay ? 0 : 1);
  const seen = first + turns - 1;
  // dist[l] is the chance of l lands so far, among the cards that pass every check so far.
  let dist = [1];
  for (let s = 0; s < seen; s++) {
    if (s < N) {
      const next = new Array(dist.length + 1).fill(0);
      dist.forEach((p, l) => {
        if (!p) return;
        const land = Math.max(0, K - l) / (N - s);
        next[l + 1] += p * land;
        next[l] += p * (1 - land);
      });
      dist = next;
    }
    const turn = s + 1 - first + 1;
    if (turn >= 1) dist = dist.map((p, l) => (l >= turn ? p : 0));
  }
  return dist.reduce((a, b) => a + b, 0);
}

/**
 * The odds of a good start for the main deck, or null when it has fewer
 * cards than a hand. Lands count by the front face, as in deck stats, so a
 * modal double-faced spell is a spell.
 * @param {import("./lists.js").Entry[]} entries
 */
export function openingOdds(entries) {
  let cards = 0;
  let lands = 0;
  let twoDrops = 0;
  for (const e of entries) {
    if (e.section !== "main") continue;
    cards += e.quantity;
    if (primaryType(e.card.typeLine) === "land") lands += e.quantity;
    else if (e.card.manaValue === 2) twoDrops += e.quantity;
  }
  if (cards < HAND_SIZE) return null;
  return {
    cards,
    lands,
    twoDrops,
    twoToFourLands: probabilityBetween(cards, lands, HAND_SIZE, 2, 4),
    landDrops: { play: landDropOdds(cards, lands, 4, true), draw: landDropOdds(cards, lands, 4, false) },
    twoDrop: { play: atLeastOne(cards, twoDrops, HAND_SIZE + 1), draw: atLeastOne(cards, twoDrops, HAND_SIZE + 2) },
  };
}

// Hands ------------------------------------------------------------------------------

/**
 * @typedef {{id: string, card: import("./cards.js").CardSnapshot}} LibraryCard
 * @typedef {Object} HandState
 * @property {LibraryCard[]} hand The opening hand first, then the cards drawn.
 * @property {LibraryCard[]} library Top card first.
 * @property {number} mulligans Mulligans taken, free ones included.
 * @property {boolean} freeMulligan Whether the first mulligan is free.
 * @property {number} toBottom Cards still to put on the bottom.
 * @property {number} drawn Cards drawn after the opening hand.
 */

/**
 * One item for each copy of each card in the main deck. The commander,
 * sideboard, and maybe sections stay out.
 * @param {import("./lists.js").Entry[]} entries
 * @returns {LibraryCard[]}
 */
export function libraryOf(entries) {
  const out = [];
  for (const e of entries) {
    if (e.section !== "main") continue;
    for (let i = 0; i < e.quantity; i++) out.push({ id: `${e.id}-${i}`, card: e.card });
  }
  return out;
}

/** Mulligans that count toward the cards to put on the bottom. */
const counted = (s) => Math.max(0, s.mulligans - (s.freeMulligan ? 1 : 0));

function deal(cards, rest) {
  return { ...rest, hand: cards.slice(0, HAND_SIZE), library: cards.slice(HAND_SIZE) };
}

/**
 * Shuffles the library and draws a hand.
 * @param {LibraryCard[]} library
 * @param {() => number} random Returns a number from 0 up to 1.
 * @param {{freeMulligan?: boolean}} [options] A free first mulligan, as in Brawl.
 * @returns {HandState}
 */
export function newHand(library, random, options = {}) {
  return deal(shuffled(library, random), { mulligans: 0, freeMulligan: !!options.freeMulligan, toBottom: 0, drawn: 0 });
}

/** A mulligan is allowed before any draw, until the hand would be zero cards. */
export function canMulligan(s) {
  return s.drawn === 0 && counted(s) < HAND_SIZE;
}

/** Draw is allowed when no card is owed to the bottom and the library has cards. */
export function canDraw(s) {
  return s.toBottom === 0 && s.library.length > 0;
}

/**
 * The London mulligan: shuffles every card back, draws a new hand, and owes
 * one card to the bottom for each counted mulligan. Returns the same state
 * when a mulligan isn't allowed.
 * @param {HandState} s
 * @param {() => number} random
 */
export function mulligan(s, random) {
  if (!canMulligan(s)) return s;
  const next = deal(shuffled([...s.hand, ...s.library], random), { ...s, mulligans: s.mulligans + 1 });
  return { ...next, toBottom: Math.min(counted(next), next.hand.length) };
}

/**
 * Puts a card from the hand on the bottom of the library. Returns the same
 * state when no card is owed or the card isn't in the hand.
 * @param {HandState} s
 * @param {string} id
 */
export function putOnBottom(s, id) {
  const card = s.hand.find((c) => c.id === id);
  if (s.toBottom === 0 || !card) return s;
  return { ...s, hand: s.hand.filter((c) => c !== card), library: [...s.library, card], toBottom: s.toBottom - 1 };
}

/**
 * Draws the top card of the library. Returns the same state when Draw isn't allowed.
 * @param {HandState} s
 */
export function drawCard(s) {
  if (!canDraw(s)) return s;
  return { ...s, hand: [...s.hand, s.library[0]], library: s.library.slice(1), drawn: s.drawn + 1 };
}
