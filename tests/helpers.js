// Shared test helpers.
import { readFileSync } from "node:fs";
import { makeSnapshot } from "../src/cards.js";

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

/** A clock with fixed, increasing dates and predictable IDs. */
export function fakeClock(start = "2026-01-01T00:00:00.000Z") {
  let t = Date.parse(start);
  let n = 0;
  return {
    now: () => new Date((t += 1000)).toISOString(),
    makeId: () => `id-${++n}`,
  };
}

/** A snapshot from a real fixture, with optional changes. */
export function snap(name, changes = {}) {
  return { ...makeSnapshot(fixture(name), "2026-01-01T00:00:00.000Z"), ...changes };
}
