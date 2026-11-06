// Links to scryfall.com. Pure module.

import { MAX_QUERY_LENGTH } from "./config.js";

/**
 * Search URLs that together show every named card on scryfall.com. Each
 * query is an exact-name search (`!"Name"`) joined with `or`, and stays under
 * MAX_QUERY_LENGTH, so a long list gives more than one URL.
 * @param {string[]} names Front-face names. Duplicates are dropped.
 * @returns {string[]}
 */
export function scryfallListUrls(names) {
  const unique = [...new Set(names.filter((n) => n && !n.includes('"')))];
  const queries = [];
  let current = "";
  for (const name of unique) {
    const term = `!"${name}"`;
    const next = current ? `${current} or ${term}` : term;
    if (current && [...next].length > MAX_QUERY_LENGTH) {
      queries.push(current);
      current = term;
    } else {
      current = next;
    }
  }
  if (current) queries.push(current);
  return queries.map((q) => `https://scryfall.com/search?${new URLSearchParams({ q, unique: "cards" }).toString()}`);
}
