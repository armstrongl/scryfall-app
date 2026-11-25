// Deck text import: reads MTG Arena text and the forms deck sites use, then
// finds the cards with the Scryfall collection endpoint. Pure module: the
// lookup gets its collection function passed in, and that function sends its
// requests through the queue in src/scryfall.js.

import { makeSnapshot } from "./cards.js";
import { addCard } from "./lists.js";

/**
 * @typedef {import("./lists.js").Section} Section
 * @typedef {Object} CardLine A line that names a card.
 * @property {number} line The line number in the pasted text, from 1.
 * @property {string} text The line as pasted, trimmed.
 * @property {number} quantity
 * @property {string} name The card name as written.
 * @property {string|null} set The set code as written, such as "DAR".
 * @property {string|null} number The collector number.
 * @property {Section} section
 * @typedef {{line: number, text: string, section: Section}} ProblemLine A line that is not a card line.
 * @typedef {{set: string, collector_number: string} | {name: string}} Identifier
 * @typedef {(identifiers: Identifier[]) => Promise<{data: any[], notFound: any[]}>} Collection
 */

/** Block headers, in any case, with or without a colon. */
const HEADERS = {
  about: "about",
  deck: "main",
  main: "main",
  maindeck: "main",
  "main deck": "main",
  sideboard: "sideboard",
  commander: "commander",
  companion: "companion",
};

const QUANTITY = /^(\d+)\s*[xX]?\s+(\S.*)$/;
/** Foil and printing marks after the collector number, such as *F* or *E*. */
const MARKS = /(\s+\*[A-Za-z]+\*)+$/;
const PRINTING = /^(.+?)\s+\(([A-Za-z0-9]{2,8})\)(?:\s+(\S+))?$/;

/**
 * Reads one card line: "4 Name", "4x Name", or "4 Name (SET) 123", with
 * optional marks such as *F* at the end.
 * @param {string} text
 * @returns {{quantity: number, name: string, set: string|null, number: string|null}|null}
 */
export function parseCardLine(text) {
  const m = QUANTITY.exec(String(text ?? "").trim());
  if (!m) return null;
  const quantity = Number(m[1]);
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const rest = m[2].replace(MARKS, "").trim();
  const p = PRINTING.exec(rest);
  if (p) return { quantity, name: p[1].trim(), set: p[2], number: p[3] ?? null };
  return rest ? { quantity, name: rest, set: null, number: null } : null;
}

/**
 * Reads pasted deck text.
 * - Card lines: see parseCardLine.
 * - Headers: About, Deck, Commander, Companion, and Sideboard.
 * - "Name …" in the About block is the deck name.
 * - A header can have a card count, such as "Deck (60)".
 * - A blank line ends a Commander, Companion, or About block.
 * - With no Sideboard header in the text, a blank line after main deck cards
 *   starts the sideboard, as in older Arena text.
 * - Arena lists a companion in its own block and again in the sideboard. A
 *   companion goes to the sideboard, once.
 * @param {string} text
 * @returns {{name: string|null, cards: CardLine[], problems: ProblemLine[]}}
 */
export function parseDeckText(text) {
  const rows = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerOf = (t) => HEADERS[t.replace(/:$/, "").replace(/\s*\(\d+\)$/, "").trim().toLowerCase()];
  const hasSideboardHeader = rows.some((row) => headerOf(row.trim()) === "sideboard");
  let name = null;
  /** @type {Section|"about"|"companion"} */
  let block = "main";
  let cardsInBlock = 0;
  /** @type {(CardLine & {companion?: boolean})[]} */
  const cards = [];
  const problems = [];
  rows.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) {
      if (block === "commander" || block === "companion" || block === "about") {
        block = "main";
        cardsInBlock = 0;
      } else if (block === "main" && cardsInBlock > 0 && !hasSideboardHeader) {
        block = "sideboard";
        cardsInBlock = 0;
      }
      return;
    }
    const header = headerOf(t);
    if (header) {
      block = header;
      cardsInBlock = 0;
      return;
    }
    if (block === "about") {
      const n = /^name\s+(.+)$/i.exec(t);
      if (n) name = n[1].trim();
      return;
    }
    const card = parseCardLine(t);
    const section = block === "companion" ? "sideboard" : block;
    if (!card) {
      problems.push({ line: i + 1, text: t, section });
      return;
    }
    cardsInBlock++;
    cards.push({ line: i + 1, text: t, ...card, section, ...(block === "companion" ? { companion: true } : {}) });
  });
  const sideNames = new Set(cards.filter((c) => c.section === "sideboard" && !c.companion).map((c) => squash(c.name)));
  const kept = cards
    .filter((c) => !(c.companion && sideNames.has(squash(c.name))))
    .map(({ companion, ...c }) => c);
  return { name, cards: kept, problems };
}

/**
 * Arena set codes to Scryfall set codes, from a Scryfall /sets response.
 * Keys are lowercase. A set's arena_code comes first, then its own code.
 * A code that is in neither is not in the map: it is never guessed.
 * @param {any} setsBody
 * @returns {Map<string, string>}
 */
export function arenaSetCodes(setsBody) {
  const map = new Map();
  const sets = Array.isArray(setsBody?.data) ? setsBody.data : [];
  for (const s of sets) {
    if (typeof s?.arena_code === "string" && typeof s.code === "string") map.set(s.arena_code.toLowerCase(), s.code);
  }
  for (const s of sets) {
    if (typeof s?.code === "string" && !map.has(s.code)) map.set(s.code, s.code);
  }
  return map;
}

/** Lowercase letters and digits only, without accents. */
function squash(s) {
  return String(s ?? "").replace(/æ/gi, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a Scryfall card has this name: its full name or a face name, in
 * any case, with any punctuation.
 * @param {any} card
 * @param {string} name
 */
export function cardMatchesName(card, name) {
  const want = squash(name);
  const names = [card?.name, ...(Array.isArray(card?.card_faces) ? card.card_faces.map((f) => f.name) : [])];
  return names.some((n) => typeof n === "string" && squash(n) === want);
}

/** Scryfall finds a card by one face name, not by "A // B". */
const lookupName = (name) => name.split("//")[0].trim();

const uniqueBy = (items, key) => [...new Map(items.map((x) => [key(x), x])).values()];

/**
 * Finds the cards for the lines. Lines with a known set code and a collector
 * number are asked for by printing first. A line whose printing isn't found,
 * or is another card, is then asked for by name, with the rest.
 * @param {CardLine[]} lines
 * @param {{collection: Collection, setCodes?: Map<string, string>}} options
 * @returns {Promise<{found: {line: CardLine, card: any}[], notFound: CardLine[]}>}
 */
export async function lookUpCards(lines, { collection, setCodes = new Map() }) {
  const found = [];
  const byName = [];
  const printing = (l) => {
    const set = l.set && l.number ? setCodes.get(l.set.toLowerCase()) : undefined;
    return set ? { set, collector_number: l.number } : null;
  };
  const withPrinting = lines.filter((l) => printing(l));
  if (withPrinting.length) {
    const ids = uniqueBy(withPrinting.map(printing), (id) => `${id.set}/${id.collector_number}`);
    const { data } = await collection(ids);
    for (const l of withPrinting) {
      const id = printing(l);
      const card = data.find((c) => c.set === id.set && String(c.collector_number) === id.collector_number && cardMatchesName(c, l.name));
      if (card) found.push({ line: l, card });
      else byName.push(l);
    }
  }
  byName.push(...lines.filter((l) => !printing(l)));
  byName.sort((a, b) => a.line - b.line);
  const notFound = [];
  if (byName.length) {
    const ids = uniqueBy(byName.map((l) => ({ name: lookupName(l.name) })), (id) => squash(id.name));
    const { data } = await collection(ids);
    for (const l of byName) {
      const card = data.find((c) => cardMatchesName(c, l.name));
      if (card) found.push({ line: l, card });
      else notFound.push(l);
    }
  }
  found.sort((a, b) => a.line.line - b.line.line);
  return { found, notFound };
}

/**
 * Adds the found cards to a list as new snapshots. The same printing in the
 * same section adds up to one entry.
 * @param {import("./lists.js").CardList} list
 * @param {{line: CardLine, card: any}[]} found
 * @param {string} fetchedAt
 * @param {import("./lists.js").Clock} [clock]
 */
export function addImported(list, found, fetchedAt, clock) {
  return found.reduce(
    (l, { line, card }) => addCard(l, makeSnapshot(card, fetchedAt), { quantity: line.quantity, section: line.section }, clock),
    list,
  );
}
