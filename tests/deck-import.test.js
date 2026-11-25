import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addImported, arenaSetCodes, cardMatchesName, lookUpCards, parseCardLine, parseDeckText,
} from "../src/deck-import.js";
import { arenaText } from "../src/export.js";
import { addCard, createList } from "../src/lists.js";
import { fakeClock, fixture, snap } from "./helpers.js";

// Test text. Sources:
// - BRAWL_EXPORT is a Brawl deck copied from the MTG Arena Export button, as
//   posted in https://gist.github.com/georgestephanis/76b27ac145f6bee4d82f2a8459c3243e
//   (shortened to five cards). Arena lists the companion in a Companion block
//   and again in the Sideboard.
// - The About and Name block is the deck name form that MTG Arena reads, as
//   described in https://draftsim.com/mtg-arena-export-deck/ and other guides.
// - "4x", lowercase set codes, and "*F*" foil marks are the forms that deck
//   sites such as Moxfield use in their text exports.
// - The rest is the app's own Export for Arena text (arenaText).
const BRAWL_EXPORT = `Commander
1 Daxos, Blessed by the Sun (THB) 9

Companion
1 Lurrus of the Dream Den (IKO) 226

Deck
1 Stonecoil Serpent (ELD) 235
22 Plains (IKO) 262
1 Shatter the Sky (THB) 37

Sideboard
1 Lurrus of the Dream Den (IKO) 226
`;

const MIXED = `About
Name Mixed forms

Deck
4x Llanowar Elves (fdn) 227 *F*
2 Fire // Ice
1 Bonecrusher Giant
3 Delver of Secrets
1 Karn, Scion of Urza (DAR) 1
1 Opt (DOM) 1
1 Not A Real Card
1 Daxos, Blessed by the Sun (Y22) 9`;

const pick = (lines) => lines.map((l) => [l.quantity, l.name, l.section]);

test("reads Arena lines with set and collector number, and the Commander, Companion, Deck, and Sideboard blocks", () => {
  const r = parseDeckText(BRAWL_EXPORT);
  assert.equal(r.name, null);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(pick(r.cards), [
    [1, "Daxos, Blessed by the Sun", "commander"],
    [1, "Stonecoil Serpent", "main"],
    [22, "Plains", "main"],
    [1, "Shatter the Sky", "main"],
    [1, "Lurrus of the Dream Den", "sideboard"],
  ], "the companion is in the sideboard once, not twice");
  assert.deepEqual(r.cards[0], {
    line: 2, text: "1 Daxos, Blessed by the Sun (THB) 9", quantity: 1, name: "Daxos, Blessed by the Sun",
    set: "THB", number: "9", section: "commander",
  });
});

test("a companion that isn't in the sideboard goes to the sideboard", () => {
  const r = parseDeckText("Companion\n1 Lurrus of the Dream-Den (IKO) 226\n\nDeck\n4 Plains");
  assert.deepEqual(pick(r.cards), [[1, "Lurrus of the Dream-Den", "sideboard"], [4, "Plains", "main"]]);
});

test("reads the deck name, 4x, set codes in any case, foil marks, and lines with no set", () => {
  const r = parseDeckText(MIXED);
  assert.equal(r.name, "Mixed forms");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.cards.map((l) => [l.quantity, l.name, l.set, l.number]), [
    [4, "Llanowar Elves", "fdn", "227"],
    [2, "Fire // Ice", null, null],
    [1, "Bonecrusher Giant", null, null],
    [3, "Delver of Secrets", null, null],
    [1, "Karn, Scion of Urza", "DAR", "1"],
    [1, "Opt", "DOM", "1"],
    [1, "Not A Real Card", null, null],
    [1, "Daxos, Blessed by the Sun", "Y22", "9"],
  ]);
  assert.ok(r.cards.every((l) => l.section === "main"));
});

test("with no headers, a blank line after the main deck starts the sideboard", () => {
  const r = parseDeckText("4 Llanowar Elves\n2 Delver of Secrets\n\n1 Fire\n3 Shatterskull Smashing\n");
  assert.deepEqual(pick(r.cards), [
    [4, "Llanowar Elves", "main"], [2, "Delver of Secrets", "main"],
    [1, "Fire", "sideboard"], [3, "Shatterskull Smashing", "sideboard"],
  ]);
});

test("blank lines before any card, and Windows line ends, change nothing", () => {
  const r = parseDeckText("\r\n\r\nDeck\r\n4 Llanowar Elves\r\n");
  assert.deepEqual(pick(r.cards), [[4, "Llanowar Elves", "main"]]);
});

test("lines that are not card lines are problems, with their line numbers", () => {
  const r = parseDeckText("Deck\n4 Llanowar Elves\nLightning Bolt\n0 Opt\nMaybeboard");
  assert.deepEqual(pick(r.cards), [[4, "Llanowar Elves", "main"]]);
  assert.deepEqual(r.problems, [
    { line: 3, text: "Lightning Bolt", section: "main" },
    { line: 4, text: "0 Opt", section: "main" },
    { line: 5, text: "Maybeboard", section: "main" },
  ]);
});

test("parseCardLine reads one line, or gives null", () => {
  assert.deepEqual(parseCardLine("4 Xenagos, the Reveler"), { quantity: 4, name: "Xenagos, the Reveler", set: null, number: null });
  assert.deepEqual(parseCardLine("1X Opt (dom) 60 *F* *E*"), { quantity: 1, name: "Opt", set: "dom", number: "60" });
  assert.deepEqual(parseCardLine("2 Opt (DOM)"), { quantity: 2, name: "Opt", set: "DOM", number: null });
  assert.equal(parseCardLine("Opt"), null);
  assert.equal(parseCardLine("4"), null);
  assert.equal(parseCardLine(""), null);
});

test("Arena set codes map to Scryfall set codes from the real /sets response", () => {
  const codes = arenaSetCodes(fixture("sets"));
  assert.equal(codes.get("dar"), "dom", "Arena calls Dominaria DAR");
  assert.equal(codes.get("dom"), "dom", "a Scryfall code still works");
  assert.equal(codes.get("fdn"), "fdn");
  assert.equal(codes.get("y22"), undefined, "an unknown code is not guessed");
  assert.equal(arenaSetCodes(null).size, 0);
});

test("names match with any case and punctuation, and by face", () => {
  const [lurrus] = fixture("collection-import-printings").data.filter((c) => c.set === "iko" && c.collector_number === "226");
  assert.ok(cardMatchesName(lurrus, "Lurrus of the Dream Den"));
  assert.ok(cardMatchesName(lurrus, "LURRUS OF THE DREAM-DEN"));
  const giant = fixture("collection-import-names").data.find((c) => c.name.startsWith("Bonecrusher"));
  assert.ok(cardMatchesName(giant, "Bonecrusher Giant"));
  assert.ok(cardMatchesName(giant, "Bonecrusher Giant // Stomp"));
  assert.ok(!cardMatchesName(giant, "Opt"));
});

// A stand-in for POST /cards/collection that answers from the real fixtures
// the way Scryfall did: a printing by exact set and collector number, a name
// by one face name in any case and punctuation, and never by a full
// "A // B" name. The next test checks it against every recorded response.
const FIXTURES = ["collection-import-printings", "collection-import-names", "collection-import-faces"];
const ALL_CARDS = FIXTURES.flatMap((f) => fixture(f).data);
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function fakeCollection(identifiers) {
  const data = [];
  const notFound = [];
  for (const id of identifiers) {
    const card = id.set
      ? ALL_CARDS.find((c) => c.set === id.set && c.collector_number === id.collector_number)
      : !id.name.includes("//") && ALL_CARDS.find((c) => [c.name, ...(c.card_faces ?? []).map((f) => f.name)]
        .some((n) => !n.includes("//") ? squash(n) === squash(id.name) : n.split(" // ").some((p) => squash(p) === squash(id.name))));
    if (card) data.push(card);
    else notFound.push(id);
  }
  return { data, notFound };
}

test("the stand-in answers each recorded request as Scryfall did", () => {
  const sent = {
    "collection-import-printings": [["thb", "9"], ["iko", "226"], ["eld", "235"], ["iko", "262"], ["thb", "37"], ["fdn", "227"], ["dom", "1"], ["dar", "1"]]
      .map(([set, collector_number]) => ({ set, collector_number })),
    "collection-import-names": ["Fire // Ice", "Bonecrusher Giant", "Delver of Secrets", "llanowar elves", "Lurrus of the Dream Den", "Not A Real Card", "Daxos, Blessed by the Sun", "Opt"]
      .map((name) => ({ name })),
    "collection-import-faces": ["Fire", "Bonecrusher Giant // Stomp", "Delver of Secrets // Insectile Aberration", "Ice"].map((name) => ({ name })),
  };
  for (const f of FIXTURES) {
    const real = fixture(f);
    const fake = fakeCollection(sent[f]);
    assert.deepEqual(fake.data.map((c) => c.id), real.data.map((c) => c.id), f);
    assert.deepEqual(fake.notFound, real.not_found, f);
  }
});

test("looks up printings by mapped set and number, then the rest by name", async () => {
  const calls = [];
  const collection = async (ids) => {
    calls.push(ids);
    return fakeCollection(ids);
  };
  const { cards } = parseDeckText(MIXED);
  const r = await lookUpCards(cards, { collection, setCodes: arenaSetCodes(fixture("sets")) });
  assert.deepEqual(calls[0], [
    { set: "fdn", collector_number: "227" },
    { set: "dom", collector_number: "1" },
  ], "DAR and DOM are both Dominaria, asked for once; Y22 is not a known code");
  assert.deepEqual(calls[1], [
    { name: "Fire" }, { name: "Bonecrusher Giant" }, { name: "Delver of Secrets" }, { name: "Opt" },
    { name: "Not A Real Card" }, { name: "Daxos, Blessed by the Sun" },
  ], "a split card goes by its first face; Opt's set and number gave another card");
  assert.equal(calls.length, 2);
  assert.deepEqual(r.found.map(({ line, card }) => [line.name, card.name, card.set]), [
    ["Llanowar Elves", "Llanowar Elves", "fdn"],
    ["Fire // Ice", "Fire // Ice", "dmr"],
    ["Bonecrusher Giant", "Bonecrusher Giant // Stomp", "clb"],
    ["Delver of Secrets", "Delver of Secrets // Insectile Aberration", "inr"],
    ["Karn, Scion of Urza", "Karn, Scion of Urza", "dom"],
    ["Opt", "Opt", "tdc"],
    ["Daxos, Blessed by the Sun", "Daxos, Blessed by the Sun", "thb"],
  ]);
  assert.deepEqual(r.notFound.map((l) => l.name), ["Not A Real Card"]);
});

test("without set codes, every card is looked up by name, and no request is sent for nothing", async () => {
  const calls = [];
  const collection = async (ids) => { calls.push(ids); return fakeCollection(ids); };
  const r = await lookUpCards(parseDeckText(BRAWL_EXPORT).cards, { collection });
  assert.equal(calls.length, 1);
  assert.equal(r.found.length, 5);
  assert.deepEqual(await lookUpCards([], { collection }), { found: [], notFound: [] });
  assert.equal(calls.length, 1);
});

test("imported cards become new snapshots in their sections; the same printing twice adds up", async () => {
  const clock = fakeClock();
  const { cards } = parseDeckText(`${BRAWL_EXPORT}\nDeck\n3 Plains (IKO) 262`);
  const { found } = await lookUpCards(cards, { collection: async (ids) => fakeCollection(ids), setCodes: arenaSetCodes(fixture("sets")) });
  const list = addImported(createList("Daxos", "deck", clock, "brawl"), found, "2026-11-25T00:00:00.000Z", clock);
  assert.deepEqual(list.entries.map((e) => [e.quantity, e.card.name, e.section]), [
    [1, "Daxos, Blessed by the Sun", "commander"],
    [1, "Stonecoil Serpent", "main"],
    [25, "Plains", "main"],
    [1, "Shatter the Sky", "main"],
    [1, "Lurrus of the Dream-Den", "sideboard"],
  ]);
  assert.ok(list.entries.every((e) => e.card.fetchedAt === "2026-11-25T00:00:00.000Z" && e.note === ""));
});

test("round trip: Export for Arena text reads back to the same cards and sections", () => {
  const clock = fakeClock();
  let standard = createList("Deck", "deck", clock);
  standard = addCard(standard, snap("card-normal"), { quantity: 4 }, clock);
  standard = addCard(standard, snap("card-transform"), { quantity: 2 }, clock);
  standard = addCard(standard, snap("card-split"), { quantity: 1, section: "sideboard" }, clock);
  let brawl = createList("Krenko", "deck", clock, "brawl");
  brawl = addCard(brawl, snap("card-legendary"), { section: "commander" }, clock);
  brawl = addCard(brawl, snap("card-normal"), {}, clock);
  brawl = addCard(brawl, snap("card-basic-land"), { quantity: 30 }, clock);
  for (const list of [standard, brawl]) {
    const want = list.entries.map((e) => [e.quantity, e.card.frontName, e.section]);
    assert.deepEqual(pick(parseDeckText(arenaText(list)).cards), want, list.name);
  }
});
