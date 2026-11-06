// "Browse all": every card that matches a query, page by page, in the
// order the user picks. Pure module. Scryfall sends up to 175 cards a page.

/** Sort orders. Values are Scryfall `order` values (https://scryfall.com/docs/api/cards/search). */
export const SORT_OPTIONS = Object.freeze([
  { value: "name", label: "Name" },
  { value: "cmc", label: "Mana value" },
  { value: "released", label: "Release date" },
  { value: "rarity", label: "Rarity" },
  { value: "color", label: "Color" },
  { value: "set", label: "Set" },
  { value: "edhrec", label: "Popularity (EDHREC rank)" },
  { value: "usd", label: "Price (USD)" },
  { value: "power", label: "Power" },
  { value: "toughness", label: "Toughness" },
  { value: "artist", label: "Artist" },
]);

export const SORT_DIRECTIONS = Object.freeze([
  { value: "auto", label: "Default" },
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
]);

/**
 * @typedef {{order: string, dir: string}} BrowseSort
 * @typedef {Object} BrowseState
 * @property {string} query
 * @property {any[]} cards Scryfall Card objects, in order.
 * @property {number|null} total
 * @property {boolean} hasMore
 * @property {number} nextPage
 */

/** @param {any} sort @returns {BrowseSort} */
export function normalizeSort(sort) {
  const order = SORT_OPTIONS.some((o) => o.value === sort?.order) ? sort.order : "name";
  const dir = SORT_DIRECTIONS.some((d) => d.value === sort?.dir) ? sort.dir : "auto";
  return { order, dir };
}

/**
 * Parameters for client.search.
 * @param {any} sort
 * @param {number} page
 */
export function browseParams(sort, page) {
  const s = normalizeSort(sort);
  return { unique: "cards", order: s.order, dir: s.dir, page };
}

/** @param {string} query @returns {BrowseState} */
export function emptyBrowse(query) {
  return { query, cards: [], total: null, hasMore: false, nextPage: 1 };
}

/**
 * Adds one page of results. Cards already in the state are not added again.
 * @param {BrowseState} state
 * @param {any} list A Scryfall List object.
 * @returns {BrowseState}
 */
export function mergePage(state, list) {
  const seen = new Set(state.cards.map((c) => c.id));
  const added = (list.data ?? []).filter((c) => !seen.has(c.id));
  return {
    query: state.query,
    cards: [...state.cards, ...added],
    total: typeof list.total_cards === "number" ? list.total_cards : state.total,
    hasMore: list.has_more === true,
    nextPage: state.nextPage + 1,
  };
}
