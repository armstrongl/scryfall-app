// Tests for the help pages built into the app (src/docs.js). They keep the
// pages in step with the app: names, limits, and removed features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_NAME, MAX_DRAW, MIN_DRAW } from "../src/config.js";
import { DOC_PAGES, NERD_MODE_TIP, docPage, inlineParts, pageText } from "../src/docs.js";

const allText = () => DOC_PAGES.map(pageText).join("\n");

test("the app is named Cascade, and the name never contains Scryfall", () => {
  assert.equal(APP_NAME, "Cascade");
  assert.doesNotMatch(APP_NAME, /scryfall/i);
});

test("help pages have unique IDs, a title, a summary, and content", () => {
  assert.ok(DOC_PAGES.length >= 5);
  const ids = DOC_PAGES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of DOC_PAGES) {
    assert.match(p.id, /^[a-z][a-z-]*$/, p.id);
    assert.ok(p.title && p.summary, p.id);
    assert.ok(p.sections.length > 0, p.id);
    for (const s of p.sections) {
      assert.ok(s.blocks.length > 0, `${p.id}: ${s.heading}`);
      for (const b of s.blocks) {
        const kinds = ["p", "steps", "list", "terms"].filter((k) => k in b);
        assert.equal(kinds.length, 1, `${p.id}: one kind per block`);
      }
    }
  }
});

test("docPage finds a page by ID and falls back to the first page", () => {
  assert.equal(docPage("nerd-mode").id, "nerd-mode");
  assert.equal(docPage("nope").id, DOC_PAGES[0].id);
  assert.equal(docPage(null).id, DOC_PAGES[0].id);
});

test("the help covers every view and the main features", () => {
  const ids = DOC_PAGES.map((p) => p.id);
  for (const id of ["get-started", "find-cards", "explore", "lists-and-decks", "nerd-mode", "your-data"]) {
    assert.ok(ids.includes(id), id);
  }
});

test("the help uses the real draw limits and the app name", () => {
  const text = allText();
  assert.match(text, new RegExp(`${MIN_DRAW} to ${MAX_DRAW} random cards`));
  assert.ok(text.includes(APP_NAME));
});

test("the help explains that redraws prefer cards you haven't seen", () => {
  assert.match(pageText(docPage("find-cards")), /recent/i);
});

test("the help doesn't mention removed features or the old name", () => {
  const text = allText();
  for (const gone of ["Brewmancer", "Copy query", "Raw query", "10 random cards"]) {
    assert.ok(!text.includes(gone), gone);
  }
});

test("the nerd mode tooltip says what nerd mode shows", () => {
  for (const word of ["mana value", "power and toughness", "set", "release date", "price", "EDHREC", "legality"]) {
    assert.ok(NERD_MODE_TIP.includes(word), word);
  }
  // The nerd mode page repeats the tooltip, so the two never disagree.
  assert.ok(pageText(docPage("nerd-mode")).includes(NERD_MODE_TIP));
});

test("inline parts mark UI labels in bold, with no HTML", () => {
  assert.deepEqual(inlineParts("Select **Draw** now."), [
    { text: "Select ", strong: false },
    { text: "Draw", strong: true },
    { text: " now.", strong: false },
  ]);
  assert.deepEqual(inlineParts("<b>x</b>"), [{ text: "<b>x</b>", strong: false }]);
  assert.ok(!allText().includes("**"), "pageText strips the bold marks");
});
