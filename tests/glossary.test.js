import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, glossaryFor, lookup, wikiUrl } from "../src/glossary.js";
import { snap } from "./helpers.js";

test("every glossary entry has a name, a kind, and a short explanation", () => {
  for (const [key, e] of Object.entries(GLOSSARY)) {
    assert.equal(key, e.name.toLowerCase());
    assert.ok(["keyword", "action", "ability word", "token"].includes(e.kind), key);
    assert.ok(e.text.length > 20 && e.text.length < 400, key);
    assert.match(e.text, /\."?$/, key);
  }
});

test("lookup ignores case, and unknown terms give null", () => {
  assert.equal(lookup("FLYING").name, "Flying");
  assert.equal(lookup("not a keyword"), null);
});

test("a card's keywords come with explanations, in the card's order", () => {
  assert.deepEqual(glossaryFor(snap("card-flyer")).map((e) => e.name), ["Flying", "Vigilance"]);
  assert.deepEqual(glossaryFor(snap("card-landfall")).map((e) => e.name), ["Landfall"]);
});

test("tokens named in rules text are explained too", () => {
  const card = snap("card-landfall", { oracleText: "When this creature enters, create a Treasure token.", keywords: [] });
  assert.deepEqual(glossaryFor(card).map((e) => e.name), ["Treasure"]);
});

test("keywords without an entry still show, with no explanation", () => {
  const card = snap("card-flyer", { keywords: ["Flying", "Madeupword"] });
  const out = glossaryFor(card);
  assert.equal(out[1].name, "Madeupword");
  assert.equal(out[1].text, null);
});

test("wiki links go to the MTG Wiki page for the term", () => {
  assert.equal(wikiUrl("First strike"), "https://mtg.fandom.com/wiki/First_strike");
});

test("corrected entries from review", () => {
  assert.doesNotMatch(lookup("Crew").text, /other untapped/);
  assert.match(lookup("Plot").text, /Plot only as a sorcery/);
  assert.match(lookup("Harmonize").text, /\{X\}/);
  assert.match(lookup("Trample").text, /battle/);
});
