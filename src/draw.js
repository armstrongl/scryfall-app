// Batch draws of random cards. No DOM or storage access. The client is
// passed in, so tests can use a fake one.
//
// Redraws prefer cards that weren't drawn recently for the same query. The
// random endpoint can't be told what to skip, so a batch sets recent cards
// aside and keeps trying. If it runs out of tries, it fills up with the
// recent cards it set aside. A small pool is drawn from one search page, so
// the batch can take every new card before any recent one.

import { DRAW_ATTEMPT_FACTOR, MAX_DRAW, MIN_DRAW } from "./config.js";
import { cardKey } from "./cards.js";

/**
 * Chooses the count for a batch.
 * @param {number} requested
 * @param {number|null} poolSize The pool size, or null if it is not known.
 * @returns {{count: number, reduced: boolean}}
 */
export function planCount(requested, poolSize) {
  let count = Math.min(MAX_DRAW, Math.max(MIN_DRAW, Math.trunc(Number(requested) || MIN_DRAW)));
  let reduced = false;
  if (poolSize !== null && poolSize !== undefined && poolSize < count) {
    count = Math.max(0, poolSize);
    reduced = true;
  }
  return { count, reduced };
}

/**
 * The card keys drawn before for this exact query, from the draw history.
 * @param {{card: import("./cards.js").CardSnapshot, query: string}[]} history
 * @param {string} query
 * @returns {Set<string>}
 */
export function recentKeys(history, query) {
  const keys = new Set();
  for (const item of history ?? []) {
    if (item?.query === query && item.card) keys.add(cardKey(item.card));
  }
  return keys;
}

/**
 * Draws up to `count` unique cards. Two results are duplicates when they have
 * the same card key. Makes at most DRAW_ATTEMPT_FACTOR × count attempts.
 * Cards in `recent` are set aside and used only when the tries run out.
 * @param {Object} args
 * @param {{random: (q: string, signal?: AbortSignal) => Promise<any>}} args.client
 * @param {string} args.query
 * @param {number} args.count
 * @param {(card: any) => string} args.keyOf
 * @param {Set<string>} [args.recent] Keys of cards drawn recently for this query.
 * @param {AbortSignal} [args.signal]
 * @param {(progress: {attempt: number, found: number, count: number}) => void} [args.onProgress]
 * @param {(card: any) => void} [args.onCard] Called for each card the batch keeps.
 * @returns {Promise<{cards: any[], attempts: number, stoppedEarly: boolean, repeats: number}>}
 */
export async function drawBatch({ client, query, count, keyOf, recent = new Set(), signal, onProgress, onCard }) {
  const maxAttempts = count * DRAW_ATTEMPT_FACTOR;
  const cards = [];
  const spare = [];
  const seen = new Set();
  let attempts = 0;
  while (cards.length < count && attempts < maxAttempts) {
    if (signal?.aborted) break;
    attempts++;
    onProgress?.({ attempt: attempts, found: cards.length, count });
    const card = await client.random(query, signal);
    const key = keyOf(card);
    if (seen.has(key)) continue;
    seen.add(key);
    if (recent.has(key)) {
      spare.push(card);
      continue;
    }
    cards.push(card);
    onCard?.(card);
  }
  let repeats = 0;
  if (!signal?.aborted) {
    for (const card of spare) {
      if (cards.length >= count) break;
      cards.push(card);
      repeats++;
      onCard?.(card);
    }
  }
  return { cards, attempts, stoppedEarly: cards.length < count, repeats };
}

/** Fisher–Yates shuffle of a copy. */
function shuffled(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draws from a whole pool that's already loaded, such as one search page.
 * Takes cards that aren't in `recent` first, in random order, then recent ones.
 * @param {any[]} pool
 * @param {number} count
 * @param {(card: any) => string} keyOf
 * @param {Set<string>} [recent]
 * @param {() => number} [random] Returns a number from 0 up to 1.
 * @returns {{cards: any[], repeats: number}}
 */
export function sampleFromPool(pool, count, keyOf, recent = new Set(), random = Math.random) {
  const unique = [];
  const seen = new Set();
  for (const card of pool) {
    const key = keyOf(card);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }
  const fresh = shuffled(unique.filter((c) => !recent.has(keyOf(c))), random);
  const old = shuffled(unique.filter((c) => recent.has(keyOf(c))), random);
  const cards = [...fresh, ...old].slice(0, Math.max(0, count));
  return { cards, repeats: Math.max(0, cards.length - fresh.length) };
}
