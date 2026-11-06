import { test } from "node:test";
import assert from "node:assert/strict";
import { cardKey, isBasicTypeLine, makeSnapshot, needsTextVersion, selectImages } from "../src/cards.js";
import { fixture } from "./helpers.js";

const AT = "2026-01-01T00:00:00.000Z";

test("normal card: one image from image_uris", () => {
  const card = fixture("card-normal");
  const imgs = selectImages(card);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].normal, card.image_uris.normal);
  assert.equal(imgs[0].small, card.image_uris.small);
  const s = makeSnapshot(card, AT);
  assert.equal(s.name, "Llanowar Elves");
  assert.equal(s.frontName, "Llanowar Elves");
  assert.equal(s.oracleId, card.oracle_id);
  assert.equal(s.arenaId, card.arena_id);
  assert.equal(s.collectorNumber, card.collector_number);
  assert.equal(typeof s.collectorNumber, "string");
  assert.equal(s.manaCost, "{G}");
  assert.equal(s.isBasicLand, false);
  assert.equal(s.standardLegality, card.legalities.standard);
  assert.equal(s.fetchedAt, AT);
  assert.equal(needsTextVersion(s), false);
});

test("transform card: one image per face", () => {
  const card = fixture("card-transform");
  assert.equal(card.image_uris, undefined);
  const imgs = selectImages(card);
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].normal, card.card_faces[0].image_uris.normal);
  assert.equal(imgs[1].normal, card.card_faces[1].image_uris.normal);
  const s = makeSnapshot(card, AT);
  assert.equal(s.frontName, "Delver of Secrets");
  assert.equal(s.name, "Delver of Secrets // Insectile Aberration");
  assert.equal(s.manaCost, "{U}");
  assert.deepEqual(s.colors, ["U"]);
  assert.equal(s.arenaId, null);
});

test("modal double-faced card: one image per face", () => {
  const card = fixture("card-mdfc");
  const imgs = selectImages(card);
  assert.equal(imgs.length, 2);
  assert.equal(imgs[1].small, card.card_faces[1].image_uris.small);
  const s = makeSnapshot(card, AT);
  assert.equal(s.frontName, "Shatterskull Smashing");
  assert.equal(s.manaCost, "{X}{R}{R}");
  assert.deepEqual(s.colors, ["R"]);
  assert.equal(s.isBasicLand, false);
});

test("split card: one image for both halves", () => {
  const card = fixture("card-split");
  const imgs = selectImages(card);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].normal, card.image_uris.normal);
  const s = makeSnapshot(card, AT);
  assert.equal(s.frontName, "Fire");
  assert.equal(s.name, "Fire // Ice");
  assert.deepEqual(s.colors, ["U", "R"]);
  assert.match(s.oracleText, /Fire/);
  assert.match(s.oracleText, /Ice/);
});

test("adventure card: one image", () => {
  const card = fixture("card-adventure");
  assert.equal(selectImages(card).length, 1);
  assert.equal(makeSnapshot(card, AT).frontName, "Bonecrusher Giant");
});

test("basic land detection", () => {
  assert.equal(makeSnapshot(fixture("card-basic-land"), AT).isBasicLand, true);
  assert.equal(makeSnapshot(fixture("card-snow-basic"), AT).isBasicLand, true);
  assert.equal(isBasicTypeLine("Basic Land — Forest"), true);
  assert.equal(isBasicTypeLine("Land — Forest"), false);
  // "Basic" only after the separator does not count.
  assert.equal(isBasicTypeLine("Creature — Basic"), false);
  assert.equal(isBasicTypeLine("Land"), false);
});

test("card key uses oracle ID, then name", () => {
  const s = makeSnapshot(fixture("card-normal"), AT);
  assert.equal(cardKey(s), s.oracleId);
  assert.equal(cardKey({ ...s, oracleId: null }), "Llanowar Elves");
});

test("snapshots of all printings of a card share a key", () => {
  // Each fixture is a different card, so keys differ.
  const names = ["card-normal", "card-transform", "card-mdfc", "card-split", "card-basic-land"];
  const keys = names.map((n) => cardKey(makeSnapshot(fixture(n), AT)));
  assert.equal(new Set(keys).size, names.length);
});

test("text version when the image is missing or a placeholder", () => {
  const s = makeSnapshot(fixture("card-normal"), AT);
  assert.equal(needsTextVersion({ ...s, imageStatus: "missing" }), true);
  assert.equal(needsTextVersion({ ...s, imageStatus: "placeholder" }), true);
  assert.equal(needsTextVersion({ ...s, images: [] }), true);
  assert.equal(needsTextVersion({ ...s, imageStatus: "lowres" }), false);
});

test("search results from a real List object make valid snapshots", () => {
  const list = fixture("search-list");
  for (const card of list.data) {
    const s = makeSnapshot(card, AT);
    assert.equal(typeof s.scryfallId, "string");
    assert.ok(s.images.length >= 1, card.name);
    assert.equal(s.standardLegality, "legal", card.name);
  }
});

// Fields for card details, Brawl checks, and buy links ----------------------------

test("snapshot keeps the details fields from a real card", () => {
  const card = fixture("card-normal");
  const s = makeSnapshot(card, AT);
  assert.deepEqual(s.keywords, card.keywords);
  assert.equal(s.legalities.standard, card.legalities.standard);
  assert.equal(s.legalities.brawl, card.legalities.brawl);
  assert.equal(s.legalities.standardbrawl, card.legalities.standardbrawl);
  assert.equal(s.power, card.power);
  assert.equal(s.toughness, card.toughness);
  assert.equal(s.loyalty, null);
  assert.equal(s.artist, card.artist);
  assert.equal(s.releasedAt, card.released_at);
  assert.equal(s.flavorText, card.flavor_text ?? null);
  assert.equal(s.edhrecRank, card.edhrec_rank);
  assert.equal(s.gameChanger, card.game_changer);
  assert.deepEqual(s.producedMana, card.produced_mana);
  assert.deepEqual(s.games, card.games);
  assert.deepEqual(s.prices, { usd: card.prices.usd, usdFoil: card.prices.usd_foil, eur: card.prices.eur, tix: card.prices.tix });
  assert.deepEqual(s.purchaseUris, { tcgplayer: card.purchase_uris.tcgplayer, cardmarket: card.purchase_uris.cardmarket, cardhoarder: card.purchase_uris.cardhoarder });
  assert.equal(s.relatedUris.edhrec, card.related_uris.edhrec);
  assert.equal(s.relatedUris.gatherer, card.related_uris.gatherer);
  assert.equal(s.images[0].large, card.image_uris.large);
});

test("snapshot lists related parts but not the card itself", () => {
  const card = fixture("card-normal");
  const s = makeSnapshot(card, AT);
  const others = card.all_parts.filter((p) => p.id !== card.id);
  assert.deepEqual(s.allParts, others.map((p) => ({ id: p.id, component: p.component, name: p.name, typeLine: p.type_line })));
  assert.ok(s.allParts.every((p) => p.id !== card.id));
});

test("two-faced card: power and toughness from the front face, flavor from any face", () => {
  const card = fixture("card-transform");
  const s = makeSnapshot(card, AT);
  assert.equal(s.power, card.card_faces[0].power);
  assert.equal(s.toughness, card.card_faces[0].toughness);
  assert.equal(s.artist, card.card_faces[0].artist);
  assert.equal(s.images[1].large, card.card_faces[1].image_uris.large);
});

test("snapshot fields are safe defaults when the card has none", () => {
  const card = fixture("card-basic-land");
  const s = makeSnapshot({ ...card, prices: undefined, purchase_uris: undefined, related_uris: undefined, all_parts: undefined, keywords: undefined, edhrec_rank: undefined }, AT);
  assert.deepEqual(s.keywords, []);
  assert.deepEqual(s.allParts, []);
  assert.deepEqual(s.prices, { usd: null, usdFoil: null, eur: null, tix: null });
  assert.deepEqual(s.purchaseUris, { tcgplayer: null, cardmarket: null, cardhoarder: null });
  assert.deepEqual(s.relatedUris, { edhrec: null, gatherer: null });
  assert.equal(s.edhrecRank, null);
});
