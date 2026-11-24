// Tests for buying paper cards: the single-card link, the list to buy, and
// the bulk-entry links for TCGplayer and Card Kingdom. Real fixtures only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addCard, createList } from "../src/lists.js";
import {
  BUY_SECTIONS, CARD_KINGDOM_BUILDER, MAX_BUY_URL_LENGTH, TCGPLAYER_MASS_ENTRY,
  buyList, buyText, cardBuyLink, cardKingdomUrls, formatUsd, tcgplayerUrls,
} from "../src/buy.js";
import { fakeClock, fixture, snap } from "./helpers.js";

// One card ---------------------------------------------------------------------
test("a card's buy link is Scryfall's TCGplayer link, with its USD price", () => {
  const link = cardBuyLink(snap("card-normal"));
  assert.equal(link.url, fixture("card-normal").purchase_uris.tcgplayer);
  assert.equal(link.price, "0.33");
});

test("a card with only a foil price shows the foil price, and one with none shows no price", () => {
  assert.equal(cardBuyLink(snap("card-normal", { prices: { usd: null, usdFoil: "0.75", eur: null, tix: null } })).price, "0.75");
  const cobra = cardBuyLink(snap("card-landfall"));
  assert.ok(cobra.url);
  assert.equal(cobra.price, null);
});

test("a card with no paper printing, or no TCGplayer link, has no buy link", () => {
  assert.equal(cardBuyLink(snap("card-normal", { games: ["arena"] })), null);
  assert.equal(cardBuyLink(snap("card-normal", { purchaseUris: { tcgplayer: null, cardmarket: null, cardhoarder: null } })), null);
  // Saved before the app kept buy links.
  const { purchaseUris, ...old } = snap("card-normal");
  assert.equal(cardBuyLink(old), null);
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
  list = addCard(list, snap("card-planeswalker", { games: ["arena"] }), {}, clock); // Arena only
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
    [1, "Serra Angel"],
  ]);
  assert.equal(r.count, 6);
  assert.equal(r.basics, 12);
  assert.deepEqual(r.noPaper, ["Teferi, Hero of Dominaria"]);
  assert.deepEqual(r.unpriced, ["Lotus Cobra"]);
  // 2.89 + 2 × 0.33 + 7.18 + 0.26, in cents.
  assert.equal(r.totalCents, 1099);
});

test("the list to buy can add basics and choose sections", () => {
  const r = buyList(deck().entries, { sections: ["main", "maybe"], basics: true });
  assert.deepEqual(r.items.map((i) => i.name), ["Llanowar Elves", "Lotus Cobra", "Shatterskull Smashing // Shatterskull, the Hammer Pass", "Forest", "Fire // Ice"]);
  assert.equal(r.basics, 0);
  assert.equal(r.count, 17);
  assert.deepEqual(r.unpriced, ["Lotus Cobra", "Forest"]);
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

test("cards saved before the app kept prices count as unpriced, not as missing", () => {
  const { prices, games, purchaseUris, ...old } = snap("card-flyer");
  const r = buyList([{ id: "e1", card: old, quantity: 1, section: "main", note: "" }]);
  assert.deepEqual(r.items.map((i) => i.name), ["Serra Angel"]);
  assert.deepEqual(r.unpriced, ["Serra Angel"]);
  assert.equal(r.oldData, 1);
});

test("buy text has one line per card, quantity first", () => {
  assert.equal(buyText(buyList(deck().entries).items),
    "1 Krenko, Mob Boss\n2 Llanowar Elves\n1 Lotus Cobra\n1 Shatterskull Smashing // Shatterskull, the Hammer Pass\n1 Serra Angel");
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

test("a 100-card Brawl deck fits in one link", () => {
  const items = Array.from({ length: 85 }, (_, i) => ({ name: `Shatterskull Smashing ${i} // Shatterskull, the Hammer Pass`.slice(0, 30), quantity: 1 }));
  assert.equal(tcgplayerUrls(items).length, 1);
});
