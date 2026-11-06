// Which lists hold a card. Pure module. Used to mark cards that are already
// saved, in search results, draws, and card details.

import { cardKey } from "./cards.js";

/**
 * @typedef {{listId: string, listName: string, kind: string, quantity: number}} SavedPlace
 */

/**
 * An index of saved cards by card key (oracle ID, so every printing counts).
 * @param {import("./lists.js").CardList[]} lists
 * @returns {Map<string, SavedPlace[]>}
 */
export function savedIndex(lists) {
  /** @type {Map<string, SavedPlace[]>} */
  const index = new Map();
  for (const list of lists) {
    for (const e of list.entries) {
      const key = cardKey(e.card);
      const places = index.get(key) ?? [];
      const place = places.find((p) => p.listId === list.id);
      if (place) place.quantity += e.quantity;
      else places.push({ listId: list.id, listName: list.name, kind: list.kind, quantity: e.quantity });
      index.set(key, places);
    }
  }
  return index;
}

/**
 * The lists that hold this card, in list-name order.
 * @param {Map<string, SavedPlace[]>} index
 * @param {{oracleId: string|null, name: string}} snapshot
 * @returns {SavedPlace[]}
 */
export function savedIn(index, snapshot) {
  return [...(index.get(cardKey(snapshot)) ?? [])].sort((a, b) => a.listName.localeCompare(b.listName));
}
