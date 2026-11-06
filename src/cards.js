// Card helpers: faces, images, snapshots, and keys. Pure module.

import { COLORS, FORMAT_KEYS } from "./config.js";

/**
 * @typedef {Object} CardImage
 * @property {string|null} small
 * @property {string|null} normal
 * @property {string|null} [large]
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
 *
 * Detail fields, added in backup schema 2. Snapshots saved before then don't
 * have them, so code that reads them must allow undefined.
 * @property {Record<string, string>} [legalities] Status by format key.
 * @property {string[]} [keywords]
 * @property {string|null} [power]
 * @property {string|null} [toughness]
 * @property {string|null} [loyalty]
 * @property {string|null} [defense]
 * @property {string|null} [artist]
 * @property {string|null} [releasedAt]
 * @property {string|null} [flavorText]
 * @property {number|null} [edhrecRank]
 * @property {boolean} [gameChanger]
 * @property {string[]} [producedMana]
 * @property {string[]} [games]
 * @property {{usd: string|null, usdFoil: string|null, eur: string|null, tix: string|null}} [prices]
 * @property {{tcgplayer: string|null, cardmarket: string|null, cardhoarder: string|null}} [purchaseUris]
 * @property {{edhrec: string|null, gatherer: string|null}} [relatedUris]
 * @property {{id: string, component: string, name: string, typeLine: string}[]} [allParts]
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
  const pick = (uris) => ({ small: uris.small ?? null, normal: uris.normal ?? null, large: uris.large ?? null });
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
    ...detailFields(card, front, faces),
  };
}

const strOrNull = (v) => (typeof v === "string" ? v : null);

/** The first face value, or the card value, as text or null. */
function faceValue(card, faces, key) {
  if (typeof card[key] === "string") return card[key];
  return strOrNull(faces?.find((f) => typeof f[key] === "string")?.[key]);
}

/**
 * Fields for the details panel, Brawl checks, and buy links.
 * @param {any} card
 * @param {any} front
 * @param {any[]|null} faces
 */
function detailFields(card, front, faces) {
  const legalities = {};
  for (const key of FORMAT_KEYS) {
    if (typeof card.legalities?.[key] === "string") legalities[key] = card.legalities[key];
  }
  const prices = card.prices ?? {};
  const buy = card.purchase_uris ?? {};
  const related = card.related_uris ?? {};
  return {
    legalities,
    keywords: Array.isArray(card.keywords) ? card.keywords.map(String) : [],
    power: strOrNull(card.power ?? front.power),
    toughness: strOrNull(card.toughness ?? front.toughness),
    loyalty: strOrNull(card.loyalty ?? front.loyalty),
    defense: strOrNull(card.defense ?? front.defense),
    artist: strOrNull(card.artist ?? front.artist),
    releasedAt: strOrNull(card.released_at),
    flavorText: faceValue(card, faces, "flavor_text"),
    edhrecRank: Number.isInteger(card.edhrec_rank) ? card.edhrec_rank : null,
    gameChanger: card.game_changer === true,
    producedMana: Array.isArray(card.produced_mana) ? card.produced_mana.map(String) : [],
    games: Array.isArray(card.games) ? card.games.map(String) : [],
    prices: {
      usd: strOrNull(prices.usd), usdFoil: strOrNull(prices.usd_foil), eur: strOrNull(prices.eur), tix: strOrNull(prices.tix),
    },
    purchaseUris: {
      tcgplayer: strOrNull(buy.tcgplayer), cardmarket: strOrNull(buy.cardmarket), cardhoarder: strOrNull(buy.cardhoarder),
    },
    relatedUris: { edhrec: strOrNull(related.edhrec), gatherer: strOrNull(related.gatherer) },
    allParts: (Array.isArray(card.all_parts) ? card.all_parts : [])
      .filter((p) => p && p.id !== card.id)
      .map((p) => ({ id: String(p.id), component: String(p.component), name: String(p.name), typeLine: String(p.type_line ?? "") })),
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
