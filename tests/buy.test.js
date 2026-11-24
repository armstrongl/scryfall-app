// Tests for buying paper cards: the single-card link, the list to buy, and
// the bulk-entry links for TCGplayer and Card Kingdom. Real fixtures only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addCard, createList } from "../src/lists.js";
import {
  BUY_SECTIONS, CARD_KINGDOM_BUILDER, MAX_BUY_URL_LENGTH, TCGPLAYER_MASS_ENTRY, TCGPLAYER_SEARCH,
  buyList, buyText, cardBuyLink, cardKingdomUrls, formatUsd, tcgplayerUrls,
} from "../src/buy.js";
import { fakeClock, fixture, snap } from "./helpers.js";

// One card ---------------------------------------------------------------------
test("a card's buy link is Scryfall's TCGplayer link, with its USD price", () => {
  const link = cardBuyLink(snap("card-normal"));
  assert.equal(link.url, fixture("card-normal").purchase_uris.tcgplayer);
  assert.equal(link.price, "0.33");
});

test("the price is the non-foil USD price only, so a foil-only or missing price shows none", () => {
  assert.equal(cardBuyLink(snap("card-normal", { prices: { usd: null, usdFoil: "0.75", eur: null, tix: null } })).price, null);
  const cobra = cardBuyLink(snap("card-landfall"));
  assert.ok(cobra.url);
  assert.equal(cobra.price, null);
});

test("a paper card shown by its Arena-only printing links to a TCGplayer search for its name", () => {
  // Abzan Falconer's j21 printing is on Arena only and has no buy links, but the card is in paper.
  const card = snap("card-arena-printing");
  assert.equal(fixture("card-arena-printing").purchase_uris, undefined);
  assert.deepEqual(card.games, ["arena"]);
  const link = cardBuyLink(card);
  assert.equal(link.url, `${TCGPLAYER_SEARCH}?productLineName=magic&q=Abzan%20Falconer`);
  assert.equal(link.price, null);
  assert.equal(TCGPLAYER_SEARCH, "https://www.tcgplayer.com/search/magic/product");
});

test("a card made only for Arena has no buy link", () => {
  assert.equal(cardBuyLink(snap("card-digital-only")), null);
});

test("a card saved before the app kept legality, games, or buy links gets a search link", () => {
  const { purchaseUris, games, legalities, ...old } = snap("card-normal");
  assert.equal(cardBuyLink(old).url, `${TCGPLAYER_SEARCH}?productLineName=magic&q=Llanowar%20Elves`);
  // A two-faced card is searched by its front face.
  const { purchaseUris: p2, ...mdfc } = snap("card-mdfc");
  assert.equal(cardBuyLink(mdfc).url, `${TCGPLAYER_SEARCH}?productLineName=magic&q=Shatterskull%20Smashing`);
});

// The list to buy ----------------------------------------------------------------
function deck() {
  const clock = fakeClock();
  let list = createList("Brawl deck", "deck", clock, "brawl");
  list = addCard(list, snap("card-legendary"), { section: "commander" }, clock); // $2.89
  list = addCard(list, snap("card-normal"), { quantity: 2 }, clock); // $0.33
  list = addCard(list, snap("card-landfall"), {}, clock); // no price
  list = addCard(list, snap("card-mdfc"), {}, clock); // $7.18
  list = addCard(list, snap("card-basic-land"), { quantity: 12 }, clock);
  list = addCard(list, snap("card-flyer"), { section: "sideboard" }, clock); // $0.26
  list = addCard(list, snap("card-split"), { section: "maybe" }, clock); // $0.22
  list = addCard(list, snap("card-digital-only"), {}, clock); // made only for Arena
  list = addCard(list, snap("card-arena-printing"), {}, clock); // paper card, Arena printing, no price
  return list;
}

test("the list to buy has commander, main, and sideboard, and leaves out maybe and basics", () => {
  assert.deepEqual(BUY_SECTIONS, ["commander", "main", "sideboard"]);
  const r = buyList(deck().entries);
  assert.deepEqual(r.items.map((i) => [i.quantity, i.name]), [
    [1, "Krenko, Mob Boss"],
    [2, "Llanowar Elves"],
    [1, "Lotus Cobra"],
    [1, "Shatterskull Smashing // Shatterskull, the Hammer Pass"],
    [1, "Abzan Falconer"],
    [1, "Serra Angel"],
  ]);
  assert.equal(r.count, 7);
  assert.equal(r.basics, 12);
  assert.deepEqual(r.noPaper, ["Absorb Energy"]);
  assert.deepEqual(r.unpriced, ["Lotus Cobra", "Abzan Falconer"]);
  // 2.89 + 2 × 0.33 + 7.18 + 0.26, in cents, from 4 of the 6 lines.
  assert.equal(r.totalCents, 1099);
  assert.equal(r.priced, 4);
});

test("the list to buy can add basics and choose sections", () => {
  const r = buyList(deck().entries, { sections: ["main", "maybe"], basics: true });
  assert.deepEqual(r.items.map((i) => i.name), ["Llanowar Elves", "Lotus Cobra", "Shatterskull Smashing // Shatterskull, the Hammer Pass", "Forest", "Abzan Falconer", "Fire // Ice"]);
  assert.equal(r.basics, 0);
  assert.equal(r.count, 18);
  assert.deepEqual(r.unpriced, ["Lotus Cobra", "Forest", "Abzan Falconer"]);
});

test("the same card in two sections or printings is one line with the quantities added", () => {
  const clock = fakeClock();
  let list = createList("Elves", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 3 }, clock);
  list = addCard(list, snap("card-normal", { scryfallId: "another-printing" }), { quantity: 2, section: "sideboard" }, clock);
  const r = buyList(list.entries);
  assert.deepEqual(r.items.map((i) => [i.quantity, i.name]), [[5, "Llanowar Elves"]]);
  assert.equal(r.totalCents, 165);
});

test("cards saved before the app kept prices stay in the list and are counted once, as old data", () => {
  const { prices, games, purchaseUris, legalities, ...old } = snap("card-flyer");
  const entries = [
    { id: "e1", card: old, quantity: 1, section: "main", note: "" },
    { id: "e2", card: { ...old, name: "Old maybe card" }, quantity: 1, section: "maybe", note: "" },
  ];
  const r = buyList(entries);
  assert.deepEqual(r.items.map((i) => i.name), ["Serra Angel"]);
  assert.deepEqual(r.unpriced, []);
  assert.equal(r.oldData, 1);
  assert.equal(r.priced, 0);
});

test("a foil-only price stays out of the total", () => {
  const r = buyList([{ id: "e1", card: snap("card-normal", { prices: { usd: null, usdFoil: "0.75", eur: null, tix: null } }), quantity: 1, section: "main", note: "" }]);
  assert.equal(r.totalCents, 0);
  assert.deepEqual(r.unpriced, ["Llanowar Elves"]);
});

test("buy text has one line per card, quantity first", () => {
  assert.equal(buyText(buyList(deck().entries).items),
    "1 Krenko, Mob Boss\n2 Llanowar Elves\n1 Lotus Cobra\n1 Shatterskull Smashing // Shatterskull, the Hammer Pass\n1 Abzan Falconer\n1 Serra Angel");
});

test("formatUsd writes dollars and cents", () => {
  assert.equal(formatUsd(1099), "$10.99");
  assert.equal(formatUsd(5), "$0.05");
  assert.equal(formatUsd(123456), "$1,234.56");
});

// Bulk-entry links -----------------------------------------------------------------
test("TCGplayer and Card Kingdom links carry the list as quantity-name lines joined by ||", () => {
  const items = buyList(deck().entries).items.slice(0, 2);
  const c = encodeURIComponent("1 Krenko, Mob Boss||2 Llanowar Elves");
  assert.deepEqual(tcgplayerUrls(items), [`${TCGPLAYER_MASS_ENTRY}?c=${c}`]);
  assert.deepEqual(cardKingdomUrls(items), [`${CARD_KINGDOM_BUILDER}?c=${c}`]);
  assert.equal(TCGPLAYER_MASS_ENTRY, "https://www.tcgplayer.com/massentry");
  assert.equal(CARD_KINGDOM_BUILDER, "https://www.cardkingdom.com/builder");
  assert.deepEqual(tcgplayerUrls([]), []);
});

test("a long list splits into several links, each under the limit, with every card once", () => {
  const items = Array.from({ length: 400 }, (_, i) => ({ name: `Card number ${i} with a long name`, quantity: 1 }));
  const urls = tcgplayerUrls(items);
  assert.ok(urls.length > 1);
  for (const u of urls) assert.ok(u.length <= MAX_BUY_URL_LENGTH, `${u.length} > ${MAX_BUY_URL_LENGTH}`);
  const names = urls.flatMap((u) => new URL(u).searchParams.get("c").split("||").map((l) => l.replace(/^1 /, "")));
  assert.deepEqual(names, items.map((i) => i.name));
});

test("a 100-card Brawl deck of 99 different cards, named like the real fixtures, fits in one link", () => {
  const names = ["card-normal", "card-transform", "card-mdfc", "card-split", "card-adventure", "card-legendary",
    "card-planeswalker", "card-landfall", "card-enchantress", "card-flyer", "card-arena-printing"].map((f) => fixture(f).name);
  const items = Array.from({ length: 99 }, (_, i) => ({ name: `${names[i % names.length]} ${i}`, quantity: 1 }));
  assert.equal(tcgplayerUrls(items).length, 1);
  assert.equal(cardKingdomUrls(items).length, 1);
});
