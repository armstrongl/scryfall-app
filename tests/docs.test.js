// Tests for the help pages built into the app (src/docs.js). They keep the
// pages in step with the app: names, limits, and removed features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { APP_NAME, MAX_DRAW, MIN_DRAW } from "../src/config.js";
import { DOC_PAGES, NERD_MODE_TIP, TIPS, docPage, inlineParts, pageLinks, pageText } from "../src/docs.js";
import { COPY_SOURCES } from "../scripts/ui-copy.mjs";

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
  for (const id of ["get-started", "find-cards", "explore", "combos", "lists-and-decks", "nerd-mode", "your-data", "glossary"]) {
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

// The docs never use third-person words such as "she" or "the owner".
// Quoted words are left out, so a rule can name the words it bans.
// tests/agent-docs.test.js checks that the docs avoid the first person too.
const ROOT = new URL("../", import.meta.url);
const DOC_FILES = [
  "README.md", "AGENTS.md", "CLAUDE.md", "REPORT.md", "PLAN.md", "CHANGELOG.md",
  ...readdirSync(new URL(".claude/rules/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `.claude/rules/${f}`),
  ...readdirSync(new URL(".agents/skills/", ROOT), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`.agents/skills/${d.name}/SKILL.md`, ROOT)))
    .map((d) => `.agents/skills/${d.name}/SKILL.md`),
  ...(existsSync(new URL("docs/", ROOT)) ? readdirSync(new URL("docs/", ROOT)).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`) : []),
];
const THIRD_PERSON = /\bowner(?:'s|s)?\b|\bshe(?:'s)?\b|\bher\b|\bhers\b|\bherself\b|\bthe developer\b|\bLarah\b/i;
const unquoted = (line) => line.replace(/"[^"]*"|“[^”]*”/g, "");

test("the docs never use the third person", () => {
  const found = [];
  for (const file of DOC_FILES) {
    readFileSync(new URL(file, ROOT), "utf8").split("\n").forEach((line, i) => {
      if (THIRD_PERSON.test(unquoted(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
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
  assert.ok(pageLinks(docPage("combos")).some((l) => l.href === "https://commanderspellbook.com"), "credit links to Commander Spellbook");
  for (const label of ["Combos", "Combos on Commander Spellbook", "Find combos", "Find My Combos"]) assert.ok(text.includes(label), label);
});

test("the Explore page mentions the Combos tab", () => {
  assert.match(pageText(docPage("explore")), /Combos/);
});

// Links -------------------------------------------------------------------------

test("inline parts turn [label](url) into links", () => {
  assert.deepEqual(inlineParts("See [Scryfall](https://scryfall.com) now."), [
    { text: "See ", strong: false },
    { text: "Scryfall", strong: false, href: "https://scryfall.com" },
    { text: " now.", strong: false },
  ]);
  assert.deepEqual(inlineParts("Open **Lists**, then [Combos](#help/combos)."), [
    { text: "Open ", strong: false },
    { text: "Lists", strong: true },
    { text: ", then ", strong: false },
    { text: "Combos", strong: false, href: "#help/combos" },
    { text: ".", strong: false },
  ]);
});

test("links that aren't https or a help page stay plain text", () => {
  for (const bad of ["[x](javascript:alert(1))", "[x](http://example.com)", "[x](//example.com)", "[x](#lists)"]) {
    assert.ok(inlineParts(bad).every((p) => !p.href), bad);
  }
});

test("pageText keeps link labels and drops the markup", () => {
  const text = allText();
  assert.ok(!/\]\(/.test(text), "no link markup in the text");
  assert.ok(pageText(docPage("combos")).includes("Commander Spellbook"));
});

test("every help link is https or points at a help page that exists", () => {
  const ids = new Set(DOC_PAGES.map((p) => p.id));
  for (const page of DOC_PAGES) {
    for (const { href } of pageLinks(page)) {
      if (href.startsWith("#help/")) assert.ok(ids.has(href.slice(6)), `${page.id}: ${href}`);
      else assert.match(href, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/, `${page.id}: ${href}`);
    }
  }
});

test("every help page links out to learn more", () => {
  for (const page of DOC_PAGES) {
    assert.ok(pageLinks(page).some((l) => l.href.startsWith("https://")), page.id);
  }
});

/** [page, link label, start of the URL] for the links each page must have. */
const EXPECTED_LINKS = [
  ["get-started", "Magic: The Gathering", "https://magic.wizards.com/"],
  ["get-started", "Scryfall", "https://scryfall.com"],
  ["get-started", "MTG Arena", "https://magic.wizards.com/en/mtgarena"],
  ["find-cards", "Standard", "https://magic.wizards.com/en/formats/standard"],
  ["find-cards", "Brawl", "https://magic.wizards.com/en/formats/brawl"],
  ["find-cards", "color identity", "https://mtg.fandom.com/wiki/Color_identity"],
  ["find-cards", "Scryfall's search syntax", "https://scryfall.com/docs/syntax"],
  ["find-cards", "Lotus Cobra", "https://scryfall.com/search?q="],
  ["card-details", "MTG Wiki", "https://mtg.fandom.com/"],
  ["card-details", "EDHREC", "https://edhrec.com"],
  ["card-details", "Gatherer", "https://gatherer.wizards.com"],
  ["explore", "Scryfall Tagger", "https://tagger.scryfall.com"],
  ["explore", "Combos", "#help/combos"],
  ["combos", "Commander Spellbook", "https://commanderspellbook.com"],
  ["combos", "Find My Combos", "https://commanderspellbook.com/find-my-combos/"],
  ["combos", "Commander brackets", "https://magic.wizards.com/en/formats/commander#brackets"],
  ["combos", "Commander Game Changers list", "https://magic.wizards.com/en/formats/commander#gamechangers"],
  ["lists-and-decks", "Combos", "#help/combos"],
  ["lists-and-decks", "mana curve", "https://mtg.fandom.com/wiki/Mana_curve"],
  ["your-data", "Add to Home Screen", "https://support.apple.com/"],
  ["your-data", "Fan Content Policy", "https://company.wizards.com/en/legal/fancontentpolicy"],
  ["glossary", "Combos", "#help/combos"],
];

test("help pages link the apps, sites, and terms they mention", () => {
  for (const [id, label, href] of EXPECTED_LINKS) {
    const links = pageLinks(docPage(id));
    assert.ok(links.some((l) => l.text === label && l.href.startsWith(href)), `${id}: [${label}](${href}…)`);
  }
});

test("card names in the help link to the card on Scryfall", () => {
  const link = pageLinks(docPage("find-cards")).find((l) => l.text === "Lotus Cobra");
  assert.equal(new URL(link.href).searchParams.get("q"), '!"Lotus Cobra"');
});

test("the glossary defines the terms the app uses, each with a link", () => {
  const page = docPage("glossary");
  const terms = page.sections.flatMap((s) => s.blocks.flatMap((b) => ("terms" in b ? b.terms : [])));
  const names = terms.map(([t]) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
  for (const t of ["Mana value", "Color identity", "Rebalanced card", "Keyword ability", "Rules text", "Game changer", "Commander brackets", "Sideboard", "Basic land", "Mana curve", "EDHREC rank", "Double-faced card"]) {
    assert.ok(names.includes(t), t);
  }
  for (const [t, d] of terms) assert.ok(/\]\(https:\/\//.test(t + d), `${t} has a link`);
});

// Tooltips ------------------------------------------------------------------------

const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const UI_JS = ["src/main.js", ...readdirSync(new URL("src/ui/", ROOT)).filter((f) => f.endsWith(".js")).map((f) => `src/ui/${f}`)];
const UI_SOURCE = UI_JS.map(read).join("\n");

test("tooltips are short sentences with no markup", () => {
  assert.ok(Object.keys(TIPS).length >= 12, "the app has tooltips beyond nerd mode");
  for (const [key, text] of Object.entries(TIPS)) {
    assert.match(text, /^[A-Z].*\.$/s, key);
    assert.ok(text.length <= 230, `${key} is ${text.length} characters`);
    assert.ok(!/\*\*|\]\(/.test(text), `${key} has no markup`);
  }
  assert.equal(TIPS.nerdMode, NERD_MODE_TIP);
});

test("every tooltip is used in the app, and the app uses no missing tooltip", () => {
  const used = new Set([...UI_SOURCE.matchAll(/\bTIPS\.(\w+)/g)].map((m) => m[1]));
  for (const key of Object.keys(TIPS)) assert.ok(used.has(key), `TIPS.${key} is used`);
  for (const key of used) assert.ok(key in TIPS, `TIPS.${key} exists`);
});

// Links from the app to the help pages ----------------------------------------------

test("links from the app to help pages point at pages that exist", () => {
  const ids = new Set(DOC_PAGES.map((p) => p.id));
  const used = [...UI_SOURCE.matchAll(/helpLink\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 6, `${used.length} help links`);
  for (const id of used) assert.ok(ids.has(id), id);
  for (const id of ["explore", "combos", "find-cards", "lists-and-decks", "your-data", "glossary"]) assert.ok(used.includes(id), id);
});

test("the copy index sources include every UI file", () => {
  for (const file of [...UI_JS, "index.html"]) assert.ok(COPY_SOURCES.includes(file), file);
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

test("code comments never use the third person", () => {
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
