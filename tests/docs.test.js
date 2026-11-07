// Tests for the help pages built into the app (src/docs.js). They keep the
// pages in step with the app: names, limits, and removed features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  for (const id of ["get-started", "find-cards", "explore", "combos", "lists-and-decks", "nerd-mode", "your-data"]) {
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

// The docs are written in my voice, as me. They never call me "the owner"
// or talk about me in the third person.
const ROOT = new URL("../", import.meta.url);
const DOC_FILES = [
  "README.md", "AGENTS.md", "REPORT.md", "PLAN.md",
  ...(existsSync(new URL("docs/", ROOT)) ? readdirSync(new URL("docs/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`) : []),
];
const THIRD_PERSON = /\bowner(?:'s|s)?\b|\bshe(?:'s)?\b|\bher\b|\bhers\b|\bherself\b/i;

test("the docs speak as me, never about me in the third person", () => {
  const found = [];
  for (const file of DOC_FILES) {
    readFileSync(new URL(file, ROOT), "utf8").split("\n").forEach((line, i) => {
      if (THIRD_PERSON.test(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  for (const page of DOC_PAGES) if (THIRD_PERSON.test(pageText(page))) found.push(`help page ${page.id}`);
  assert.deepEqual(found, []);
});

test("there's no profile doc, and no doc points to one", () => {
  for (const gone of ["docs/about-me.md", "docs/owner-profile.md"]) assert.ok(!existsSync(new URL(gone, ROOT)), gone);
  const found = [];
  for (const file of DOC_FILES) {
    readFileSync(new URL(file, ROOT), "utf8").split("\n").forEach((line, i) => {
      if (/about-me|owner-profile/.test(line)) found.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test("the Combos page explains bracket tags and credits Commander Spellbook", () => {
  const text = pageText(docPage("combos"));
  for (const tag of ["Ruthless", "Spicy", "Powerful", "Oddball", "Core", "Exhibition"]) assert.ok(text.includes(tag), tag);
  assert.match(text, /commanderspellbook\.com/);
  for (const label of ["Combos", "Combos on Commander Spellbook", "Find combos", "Find My Combos"]) assert.ok(text.includes(label), label);
});

test("the Explore page mentions the Combos tab", () => {
  assert.match(pageText(docPage("explore")), /Combos/);
});

test("the help pages use APP_NAME, never the name written out", () => {
  const source = readFileSync(new URL("src/docs.js", ROOT), "utf8");
  const lines = source.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(APP_NAME));
  assert.deepEqual(lines, []);
});

test("the help lists every link in a card's details", () => {
  const text = pageText(docPage("card-details"));
  for (const name of ["Scryfall", "EDHREC", "Gatherer", "Commander Spellbook"]) assert.ok(text.includes(name), name);
});

test("Get started mentions Explore, combos, and the Apply step", () => {
  const text = pageText(docPage("get-started"));
  for (const word of ["Explore", "combos", "Find combos", "Apply"]) assert.ok(text.includes(word), word);
});

test("the backup reminder matches the rule in export.js", () => {
  const text = pageText(docPage("your-data"));
  assert.match(text, /never backed up/);
  assert.match(text, /presets/);
});

test("the help says combo links use Commander when a search has no format", () => {
  assert.match(pageText(docPage("explore")), /no format/);
});

test("code comments speak as me too", () => {
  // This file is left out: it names the words it looks for.
  const files = ["index.html", "styles.css",
    ...["src", "src/ui", "src/storage", "scripts", "tests"].flatMap((d) =>
      readdirSync(new URL(`${d}/`, ROOT)).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => `${d}/${f}`))]
    .filter((f) => f !== "tests/docs.test.js");
  const found = [];
  for (const file of files) {
    readFileSync(new URL(file, ROOT), "utf8").split("\n").forEach((line, i) => {
      // Card rules text says "its owner" and "owner's control", which is
      // about players in the game, so only "the owner" counts here.
      if (/\bthe owner\b|\bshe(?:'s)?\b|\bherself\b/i.test(line)) found.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
