// Tests for combo links to Commander Spellbook (src/combos.js). The app
// sends no requests to Commander Spellbook: it only builds links to their
// site. The search terms were checked on commanderspellbook.com on
// 2026-11-07: card="…", legal:<format>, and coloridentity<=<colors> all
// parse, and their card names match Scryfall's full names ("A // B").
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPELLBOOK_SITE } from "../src/config.js";
import {
  FIND_MY_COMBOS_URL, SPELLBOOK_FORMATS, canLeadDeck, cardComboSearch, exploreCombos, findMyCombosText,
  identityComboSearch, listCombos, spellbookFormat, spellbookSearchUrl,
} from "../src/combos.js";
import { addCard, createList, setKind } from "../src/lists.js";
import { fakeClock, snap } from "./helpers.js";

const queryOf = (url) => new URL(url).searchParams.get("q");

test("links go to commanderspellbook.com", () => {
  assert.equal(SPELLBOOK_SITE, "https://commanderspellbook.com");
  assert.equal(FIND_MY_COMBOS_URL, "https://commanderspellbook.com/find-my-combos/");
  const url = spellbookSearchUrl('card="Lotus Cobra"');
  assert.ok(url.startsWith("https://commanderspellbook.com/search/?q="));
  assert.equal(queryOf(url), 'card="Lotus Cobra"');
});

test("Arena formats map to Commander Spellbook's format names", () => {
  assert.equal(spellbookFormat("standard"), "standard");
  assert.equal(spellbookFormat("standardbrawl"), "standard_brawl");
  assert.equal(spellbookFormat("brawl"), "brawl");
  assert.equal(spellbookFormat("alchemy"), "alchemy");
  assert.equal(spellbookFormat("commander"), "commander");
});

test("formats Commander Spellbook doesn't track fall back to Commander", () => {
  for (const f of ["historic", "timeless", "gladiator", null, undefined, "nope"]) {
    assert.equal(spellbookFormat(f), null, String(f));
  }
  assert.ok(!("historic" in SPELLBOOK_FORMATS));
});

test("a card's combo search uses its exact full name and the format", () => {
  const s = cardComboSearch(snap("card-landfall"), "brawl");
  assert.equal(s.label, "Combos with Lotus Cobra");
  assert.equal(queryOf(s.url), 'card="Lotus Cobra" legal:brawl');
  assert.match(s.reason, /Legal in Brawl/);
});

test("a double-faced card is searched by its full name", () => {
  const s = cardComboSearch(snap("card-transform"), "standardbrawl");
  assert.equal(queryOf(s.url), 'card="Delver of Secrets // Insectile Aberration" legal:standard_brawl');
  assert.equal(s.label, "Combos with Delver of Secrets // Insectile Aberration");
});

test("quotes in a card name are escaped", () => {
  const s = cardComboSearch(snap("card-normal", { name: 'Kongming, "Sleeping Dragon"' }), "commander");
  assert.equal(queryOf(s.url), 'card="Kongming, \\"Sleeping Dragon\\"" legal:commander');
});

test("an untracked format searches Commander and says so", () => {
  const s = cardComboSearch(snap("card-landfall"), "historic");
  assert.equal(queryOf(s.url), 'card="Lotus Cobra" legal:commander');
  assert.match(s.reason, /doesn't track Historic/);
  assert.match(s.reason, /Commander/);
  const any = cardComboSearch(snap("card-landfall"), null);
  assert.equal(queryOf(any.url), 'card="Lotus Cobra" legal:commander');
});

test("reasons name searches in plain words, with no query syntax", () => {
  for (const s of [cardComboSearch(snap("card-landfall"), "brawl"), identityComboSearch(snap("card-legendary"), "brawl")]) {
    assert.doesNotMatch(`${s.label} ${s.reason}`, /card=|legal:|coloridentity|<=/);
  }
});

test("legendary creatures and planeswalkers can lead a deck", () => {
  assert.equal(canLeadDeck(snap("card-legendary")), true);
  assert.equal(canLeadDeck(snap("card-planeswalker")), true);
  assert.equal(canLeadDeck(snap("card-landfall")), false);
  assert.equal(canLeadDeck(snap("card-transform")), false);
});

test("a commander's color search stays within its color identity", () => {
  const s = identityComboSearch(snap("card-planeswalker"), "brawl");
  assert.equal(s.label, "Combos in Teferi, Hero of Dominaria's colors");
  assert.equal(queryOf(s.url), "coloridentity<=wu legal:brawl");
  assert.match(s.reason, /as your commander/);
});

test("a colorless commander searches colorless combos", () => {
  const s = identityComboSearch(snap("card-legendary", { colorIdentity: [] }), "brawl");
  assert.equal(queryOf(s.url), "coloridentity<=c legal:brawl");
});

test("Explore offers the card's combos, plus its colors when it can lead a deck", () => {
  assert.deepEqual(exploreCombos(snap("card-landfall"), "standard").map((s) => s.id), ["card"]);
  assert.deepEqual(exploreCombos(snap("card-legendary"), "brawl").map((s) => s.id), ["card", "identity"]);
});

test("the decklist text matches Commander Spellbook's format, with a Commanders block", () => {
  const clock = fakeClock();
  let list = setKind(createList("Krenko", "deck", clock, "brawl"), "deck", clock);
  list = addCard(list, snap("card-legendary"), { section: "commander" }, clock);
  list = addCard(list, snap("card-normal"), { quantity: 2 }, clock);
  list = addCard(list, snap("card-transform"), {}, clock);
  list = addCard(list, snap("card-landfall"), { section: "maybe" }, clock);
  assert.equal(findMyCombosText(list), [
    "2 Llanowar Elves",
    "1 Delver of Secrets // Insectile Aberration",
    "// Commanders",
    "1 Krenko, Mob Boss",
  ].join("\n"));
});

test("the decklist text leaves out the maybe section and keeps the sideboard", () => {
  const clock = fakeClock();
  let list = createList("Pile", "collection", clock);
  list = addCard(list, snap("card-normal"), {}, clock);
  list = addCard(list, snap("card-landfall"), { section: "sideboard" }, clock);
  list = addCard(list, snap("card-flyer"), { section: "maybe" }, clock);
  const text = findMyCombosText(list);
  assert.match(text, /^1 Llanowar Elves\n1 Lotus Cobra$/);
  assert.doesNotMatch(text, /Commanders/);
});

test("a list's combos use the deck's format, or the current format for a collection", () => {
  const clock = fakeClock();
  let deck = createList("Krenko", "deck", clock, "brawl");
  deck = addCard(deck, snap("card-legendary"), { section: "commander" }, clock);
  const d = listCombos(deck, "standard");
  assert.equal(d.formatName, "Brawl");
  assert.deepEqual(d.searches.map((s) => queryOf(s.url)), ['card="Krenko, Mob Boss" legal:brawl', "coloridentity<=r legal:brawl"]);

  const pile = addCard(createList("Pile", "collection", clock), snap("card-normal"), {}, clock);
  const c = listCombos(pile, "standardbrawl");
  assert.equal(c.formatName, "Standard Brawl");
  assert.deepEqual(c.searches, []);
  assert.equal(c.text, "1 Llanowar Elves");
});

test("a Standard deck gets no commander searches", () => {
  const clock = fakeClock();
  const deck = addCard(createList("Mono G", "deck", clock, "standard"), snap("card-normal"), {}, clock);
  assert.deepEqual(listCombos(deck, "brawl").searches, []);
});
