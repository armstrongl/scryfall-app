// Batch draws of random cards. No DOM or storage access. The client is
// passed in, so tests can use a fake one.

import { DRAW_ATTEMPT_FACTOR, MAX_DRAW, MIN_DRAW } from "./config.js";

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
 * Draws up to `count` unique cards. Two results are duplicates when they have
 * the same card key. Makes at most DRAW_ATTEMPT_FACTOR × count attempts.
 * @param {Object} args
 * @param {{random: (q: string, signal?: AbortSignal) => Promise<any>}} args.client
 * @param {string} args.query
 * @param {number} args.count
 * @param {(card: any) => string} args.keyOf
 * @param {AbortSignal} [args.signal]
 * @param {(progress: {attempt: number, found: number, count: number}) => void} [args.onProgress]
 * @param {(card: any) => void} [args.onCard] Called for each new unique card.
 * @returns {Promise<{cards: any[], attempts: number, stoppedEarly: boolean}>}
 */
export async function drawBatch({ client, query, count, keyOf, signal, onProgress, onCard }) {
  const maxAttempts = count * DRAW_ATTEMPT_FACTOR;
  const cards = [];
  const seen = new Set();
  let attempts = 0;
  while (cards.length < count && attempts < maxAttempts) {
    if (signal?.aborted) break;
    attempts++;
    onProgress?.({ attempt: attempts, found: cards.length, count });
    const card = await client.random(query, signal);
    const key = keyOf(card);
    if (!seen.has(key)) {
      seen.add(key);
      cards.push(card);
      onCard?.(card);
    }
  }
  return { cards, attempts, stoppedEarly: cards.length < count };
}
