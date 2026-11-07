// Tests for the interface copy index (scripts/ui-copy.mjs, docs/ui-copy.md).
// The index lists every text the app shows or announces, so the copy can be
// audited in one place. It's generated, and this test fails when it's stale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TIPS } from "../src/docs.js";
import { COPY_INDEX, buildIndex, extractHtmlCopy, extractJsCopy } from "../scripts/ui-copy.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const texts = (items) => items.map((x) => x.text);

test("JavaScript copy: labels, announcements, and messages", () => {
  const src = `
    // A comment with "Not copy" in it.
    h("button", { type: "button", class: "primary big", text: "Show cards", "aria-label": "Show the cards" });
    announce(\`Drew \${n} cards.\`);
    message("error", "Enter a name for the list.");
    field("Sort by", select, "Optional hint text.");
    el.textContent = "Loading rulings…";
  `;
  const items = extractJsCopy(src);
  assert.deepEqual(texts(items), ["Show cards", "Show the cards", "Drew {…} cards.", "Enter a name for the list.", "Sort by", "Optional hint text.", "Loading rulings…"]);
  assert.deepEqual(items.map((x) => x.kind), ["text", "aria-label", "announce", "message", "field", "field", "text"]);
});

test("JavaScript copy skips classes, IDs, URLs, events, and keys", () => {
  const src = `
    h("a", { id: "open-scryfall", class: "button ghost", href: "https://scryfall.com", target: "_blank", rel: "noopener" });
    el.addEventListener("mouseover", fn);
    if (e.key === "Escape") close();
    document.querySelector(".results .tile");
    import { h } from "./dom.js";
  `;
  assert.deepEqual(extractJsCopy(src), []);
});

test("JavaScript copy finds text nested in template literals", () => {
  const items = extractJsCopy("h(\"option\", { text: p.builtIn ? `${p.name} (built in)` : p.name });");
  assert.ok(texts(items).includes("{…} (built in)"), JSON.stringify(items));
});

test("HTML copy: text, alt, aria-label, and the meta description", () => {
  const html = `<head><title>Cascade</title><meta name="description" content="Discover cards."></head>
    <body><a class="skip" href="#main">Skip to content</a><nav aria-label="Views"></nav><script>x</script></body>`;
  assert.deepEqual(texts(extractHtmlCopy(html)), ["Cascade", "Discover cards.", "Skip to content", "Views"]);
});

test("the copy index is up to date", () => {
  const current = readFileSync(new URL(COPY_INDEX, `file://${ROOT}`), "utf8");
  assert.ok(current === buildIndex(ROOT), "docs/ui-copy.md is stale. Run: node scripts/ui-copy.mjs");
});

test("the copy index lists every tooltip", () => {
  const index = buildIndex(ROOT);
  for (const key of Object.keys(TIPS)) assert.ok(index.includes(`\`TIPS.${key}\``), key);
});

test("JavaScript copy decodes \\u escapes", () => {
  assert.deepEqual(texts(extractJsCopy('h("button", { text: "\\u00d7 Remove" });')), ["× Remove"]);
});

test("the extractor finds every announce() and aria-label in the UI", () => {
  // A check that the tokenizer didn't lose its place, for example on a regex.
  const index = buildIndex(ROOT);
  for (const file of ["src/ui/discover.js", "src/ui/lists-view.js", "src/ui/details.js"]) {
    const src = readFileSync(new URL(file, `file://${ROOT}`), "utf8");
    const found = new Set(extractJsCopy(src).map((x) => x.text));
    for (const m of src.matchAll(/(?:announce\(|"aria-label": )"([^"\\]+)"/g)) {
      assert.ok(found.has(m[1]), `${file}: ${m[1]}`);
      assert.ok(index.includes(m[1]), `index: ${m[1]}`);
    }
  }
});
