// Card helpers: faces, images, snapshots, and keys. Pure module.

import { COLORS } from "./config.js";

/**
 * @typedef {Object} CardImage
 * @property {string|null} small
 * @property {string|null} normal
 */

/**
 * A copy of the card data that the app keeps for a saved or drawn card.
 * See PLAN.md section 5.1. The fields `oracleText` and `imageStatus` are
 * additions so a saved card can show its text version without a new request.
 * @typedef {Object} CardSnapshot
 * @property {string} scryfallId
 * @property {string|null} oracleId
 * @property {string} name
 * @property {string} frontName
 * @property {number|null} arenaId
 * @property {string} set
 * @property {string} setName
 * @property {string} collectorNumber
 * @property {string} rarity
 * @property {string} manaCost
 * @property {number} manaValue
 * @property {string} typeLine
 * @property {string[]} colors
 * @property {string[]} colorIdentity
 * @property {boolean} isBasicLand
 * @property {string} standardLegality
 * @property {CardImage[]} images
 * @property {string} scryfallUri
 * @property {string} oracleText
 * @property {string} imageStatus
 * @property {string} fetchedAt
 */

/** @param {any} card A Scryfall Card object. */
export function getFaces(card) {
  return Array.isArray(card.card_faces) && card.card_faces.length > 0 ? card.card_faces : null;
}

/**
 * Chooses the images for a card. A card-level `image_uris` wins. If it is
 * missing, each face that has `image_uris` gives one image.
 * @param {any} card
 * @returns {CardImage[]}
 */
export function selectImages(card) {
  const pick = (uris) => ({ small: uris.small ?? null, normal: uris.normal ?? null });
  if (card.image_uris) return [pick(card.image_uris)];
  const faces = getFaces(card);
  if (!faces) return [];
  return faces.filter((f) => f.image_uris).map((f) => pick(f.image_uris));
}

/**
 * The part of a type line before the subtype separator (U+2014) contains the
 * word "Basic".
 * @param {string} frontTypeLine
 */
export function isBasicTypeLine(frontTypeLine) {
  const supertypes = (frontTypeLine ?? "").split("—")[0];
  return /\bBasic\b/.test(supertypes);
}

function sortColors(list) {
  const upper = COLORS.map((c) => c.toUpperCase());
  return upper.filter((c) => list.includes(c));
}

/** @param {any} card */
function oracleTextOf(card) {
  const faces = getFaces(card);
  if (card.oracle_text !== undefined && !faces) return card.oracle_text;
  if (!faces) return card.oracle_text ?? "";
  return faces
    .map((f) => [f.name, f.mana_cost, f.type_line, f.oracle_text].filter(Boolean).join("\n"))
    .join("\n\n");
}

/**
 * Makes a CardSnapshot from a Scryfall Card object.
 * @param {any} card
 * @param {string} fetchedAt ISO 8601 date.
 * @returns {CardSnapshot}
 */
export function makeSnapshot(card, fetchedAt) {
  const faces = getFaces(card);
  const front = faces ? faces[0] : card;
  const colors = Array.isArray(card.colors)
    ? sortColors(card.colors)
    : sortColors((faces ?? []).flatMap((f) => f.colors ?? []));
  return {
    scryfallId: card.id,
    oracleId: card.oracle_id ?? faces?.[0]?.oracle_id ?? null,
    name: card.name,
    frontName: faces ? faces[0].name : card.name,
    arenaId: Number.isInteger(card.arena_id) ? card.arena_id : null,
    set: card.set,
    setName: card.set_name,
    collectorNumber: String(card.collector_number),
    rarity: card.rarity,
    manaCost: card.mana_cost ?? front.mana_cost ?? "",
    manaValue: typeof card.cmc === "number" ? card.cmc : 0,
    typeLine: card.type_line ?? front.type_line ?? "",
    colors,
    colorIdentity: Array.isArray(card.color_identity) ? sortColors(card.color_identity) : [],
    isBasicLand: isBasicTypeLine(front.type_line ?? card.type_line),
    standardLegality: card.legalities?.standard ?? "unknown",
    images: selectImages(card),
    scryfallUri: card.scryfall_uri,
    oracleText: oracleTextOf(card),
    imageStatus: card.image_status ?? "missing",
    fetchedAt,
  };
}

/**
 * The key that identifies one card across printings.
 * @param {{oracleId: string|null, name: string}} snapshot
 */
export function cardKey(snapshot) {
  return snapshot.oracleId ?? snapshot.name;
}

/**
 * True when the app must show the text version instead of an image.
 * @param {CardSnapshot} snapshot
 */
export function needsTextVersion(snapshot) {
  if (snapshot.imageStatus === "missing" || snapshot.imageStatus === "placeholder") return true;
  return !snapshot.images.some((img) => img.normal || img.small);
}

/** Alt text for a card image: the name and the type line. */
export function imageAlt(snapshot) {
  return `${snapshot.name}. ${snapshot.typeLine}`;
}

const RARITY_NAMES = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic", special: "Special", bonus: "Bonus" };

export function rarityName(rarity) {
  return RARITY_NAMES[rarity] ?? rarity;
}

const LEGALITY_NAMES = { legal: "legal", not_legal: "not legal", banned: "banned", restricted: "restricted" };

export function legalityName(status) {
  return LEGALITY_NAMES[status] ?? status;
}
