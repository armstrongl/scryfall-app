#!/usr/bin/env node
// Builds docs/ui-copy.md, the index of every text the app shows or
// announces: labels, buttons, hints, messages, aria-label text, announce()
// messages, and tooltips. Use it to audit the interface copy in one place.
//
//   node scripts/ui-copy.mjs          writes docs/ui-copy.md
//   node scripts/ui-copy.mjs --check  exits 1 if docs/ui-copy.md is stale
//
// tests/ui-copy.test.js fails when the index is stale, so run this after any
// change to the interface copy. The extractor reads the source as text and
// never runs it.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_PAGES, TIPS, pageLinks } from "../src/docs.js";

export const COPY_INDEX = "docs/ui-copy.md";

const UI_DIR = "src/ui";
const uiFiles = (root) => readdirSync(join(root, UI_DIR)).filter((f) => f.endsWith(".js")).sort().map((f) => `${UI_DIR}/${f}`);

/** Files with interface copy, in index order. */
export const COPY_SOURCES = [
  "index.html",
  "src/main.js",
  ...uiFiles(fileURLToPath(new URL("..", import.meta.url))),
];

// JavaScript ------------------------------------------------------------------------

/**
 * Splits source into string tokens. Each token has its start offset and its
 * text. Template literals show each ${…} as {…}, and the strings inside the
 * expressions become tokens of their own. Comments are skipped. Regular
 * expression literals aren't recognized, so UI files shouldn't hold quotes
 * inside a regex.
 * @param {string} src
 */
function stringTokens(src) {
  const tokens = [];
  let i = 0;

  /** Reads code until an unmatched } (inside ${…}) or the end. */
  function code(stopAtBrace) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "/" && next === "/") {
        while (i < src.length && src[i] !== "\n") i++;
      } else if (c === "/" && next === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? src.length : end + 2;
      } else if (c === '"' || c === "'") {
        tokens.push(quoted(c));
      } else if (c === "`") {
        const start = i;
        const text = template();
        tokens.push({ start, text });
      } else if (c === "{") {
        depth++;
        i++;
      } else if (c === "}") {
        if (stopAtBrace && depth === 0) return;
        depth--;
        i++;
      } else {
        i++;
      }
    }
  }

  function quoted(q) {
    const start = i++;
    let text = "";
    while (i < src.length && src[i] !== q && src[i] !== "\n") {
      if (src[i] === "\\") {
        text += src[i + 1] === "n" ? "\n" : src[i + 1];
        i += 2;
      } else {
        text += src[i++];
      }
    }
    i++;
    return { start, text };
  }

  function template() {
    i++;
    let text = "";
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        text += src[i + 1] === "n" ? "\n" : src[i + 1];
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        code(true);
        i++;
        text += "{…}";
      } else {
        text += src[i++];
      }
    }
    i++;
    return text;
  }

  code(false);
  return tokens.sort((a, b) => a.start - b.start);
}

/** Keys and calls whose string argument is interface copy, and the kind each gets. */
// A key's value can be a ternary, such as text: a ? "One" : "Other", so key
// contexts allow anything but a comma between the key and the string.
const COPY_CONTEXTS = [
  [/\btext:[^,]*$/, "text"],
  [/"aria-label":[^,]*$/, "aria-label"],
  [/\btitle:[^,]*$/, "title"],
  [/\bplaceholder:[^,]*$/, "placeholder"],
  [/\b(confirmLabel|message|label|intro|empty):[^,]*$/, (m) => m[1]],
  [/\bannounce\(\s*$/, "announce"],
  [/\bnotify\(\s*$/, "notify"],
  [/\bmessage\(\s*"\w+",\s*$/, "message"],
  [/\bfield\([^()]*$/, "field"],
  [/\bcheckbox\(\s*$/, "checkbox"],
  [/\binfoTip\([^()]*$/, "tooltip button"],
  [/\.textContent\s*=\s*$/, "text"],
];

/** Contexts whose strings are never copy, even when they look like prose. */
const NOT_COPY = /(?:\b(?:class|id|type|role|rel|target|href|src|name|value|for|accept|inputmode|autocomplete|min|max|step|rows|style|tabindex|method|datetime|download|width|height|loading|decoding)\s*:|\bh\(|\bimport\b.*|\bfrom|querySelector(?:All)?\(|getElementById\(|addEventListener\(|closest\(|classList\.\w+\(|setAttribute\(|getAttribute\(|toggleAttribute\(|removeAttribute\(|matches\(|getPropertyValue\(|===|!==|\bcase)\s*$/;

/** Prose: starts with a capital letter, a number, or a symbol people read, and has a letter. */
const looksLikeProse = (text) => /^[A-Z0-9★←×(]/.test(text.trim()) && /[a-z]/i.test(text) && text.trim().length > 1;

/**
 * The interface copy in a JavaScript file, in source order.
 * @param {string} src
 * @returns {{kind: string, text: string}[]}
 */
export function extractJsCopy(src) {
  const items = [];
  for (const { start, text } of stringTokens(src)) {
    const before = src.slice(Math.max(0, start - 80), start).split("\n").pop();
    const clean = text.replace(/\s+/g, " ").trim();
    if (!/[a-z]/i.test(clean) || clean === "{…}") continue;
    // A comparison, a method called on the string, or a timestamp is never copy.
    if (NOT_COPY.test(before) || /^\s*\./.test(src.slice(start + text.length + 2, start + text.length + 4)) || /^\d{4}-\d\d-\d\dT/.test(clean)) continue;
    let kind = null;
    for (const [re, k] of COPY_CONTEXTS) {
      const m = before.match(re);
      if (m) {
        kind = typeof k === "function" ? k(m) : k;
        break;
      }
    }
    if (!kind) {
      if (!looksLikeProse(clean)) continue;
      kind = "text";
    }
    items.push({ kind, text: clean });
  }
  return items;
}

// HTML ------------------------------------------------------------------------------

/**
 * The copy in an HTML file: text, the title, and the alt, aria-label, title,
 * placeholder, and meta description attributes. Scripts and styles are skipped.
 * @param {string} html
 */
export function extractHtmlCopy(html) {
  const items = [];
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.replace(/>[\s\S]*</, "><"));
  for (const m of clean.matchAll(/<([a-z]+)\b([^>]*)>|<[/!][^>]*>|([^<]+)/gi)) {
    if (m[1] === undefined && m[3] === undefined) continue;
    if (m[3] !== undefined) {
      const text = m[3].replace(/\s+/g, " ").trim();
      if (/[a-z]/i.test(text)) items.push({ kind: "text", text });
      continue;
    }
    const [, tag, attrs] = m;
    for (const a of attrs.matchAll(/([a-z-]+)="([^"]*)"/gi)) {
      const [, name, value] = a;
      const meta = tag.toLowerCase() === "meta" && name === "content" && /name="description"|name="apple-mobile-web-app-title"/.test(attrs);
      if ((["alt", "aria-label", "title", "placeholder"].includes(name) || meta) && /[a-z]/i.test(value)) {
        items.push({ kind: meta ? "meta" : name, text: value });
      }
    }
  }
  return items;
}

// The index ---------------------------------------------------------------------------

/**
 * Every piece of copy, with its file.
 * @param {string} root The repository root.
 */
export function collectCopy(root) {
  return COPY_SOURCES.flatMap((file) => {
    const src = readFileSync(join(root, file), "utf8");
    return (file.endsWith(".html") ? extractHtmlCopy(src) : extractJsCopy(src)).map((x) => ({ file, ...x }));
  });
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

/**
 * The text of docs/ui-copy.md.
 * @param {string} root The repository root.
 */
export function buildIndex(root) {
  const tipUses = new Map(Object.keys(TIPS).map((k) => [k, []]));
  for (const file of COPY_SOURCES.filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(root, file), "utf8");
    for (const m of src.matchAll(/\bTIPS\.(\w+)/g)) {
      const uses = tipUses.get(m[1]);
      if (uses && !uses.includes(file)) uses.push(file);
    }
  }

  const lines = [
    "# Interface copy index",
    "",
    "<!-- Generated by scripts/ui-copy.mjs. Don't edit this file by hand. -->",
    "",
    "This index lists every text the app shows or announces, so the copy can be checked, audited, and updated in one place. It's for agents and contributors, not for people who use the app.",
    "",
    "- To update it, run `node scripts/ui-copy.mjs`. `npm test` fails when it's out of date.",
    "- The rules for the copy are in `AGENTS.md`, under \"Code conventions\" and \"Keep the docs in step\".",
    "- `{…}` stands for a value the app fills in, such as a card name or a count.",
    "- The extractor reads the source as text. It finds strings by their context, such as `text:`, `aria-label`, `announce()`, and `message()`, and other strings that read like prose. Search the source too before you rename something.",
    "",
    "## Where the copy lives",
    "",
    "| Copy | Where |",
    "| --- | --- |",
    "| Tooltips | `TIPS` in `src/docs.js`. The nerd mode tooltip is `NERD_MODE_TIP`, and `index.html` repeats it. |",
    "| Help pages | `DOC_PAGES` in `src/docs.js`, shown in the **Help** view. |",
    "| Labels, buttons, hints, messages, and `announce()` text | `src/ui/` and `src/main.js` |",
    "| Page title, header, footer, and the Fan Content notice | `index.html`, `src/config.js` (`APP_NAME`, `FAN_CONTENT_NOTICE`) |",
    "| Error messages from Scryfall requests | `errorMessage()` in `src/scryfall.js` |",
    "| Filter chips and search hints | `filterChips()` and `buildQuery()` in `src/query.js` |",
    "| Explore suggestions and reasons | `src/explore.js`, `src/synergy.js`, and `src/combos.js` |",
    "| Deck check messages | `src/deck-rules.js` |",
    "| Keyword explanations | `src/glossary.js` |",
    "| Sort names, format names, and section names | `src/browse.js` and `src/config.js` |",
    "",
    "## Tooltips",
    "",
    "| Key | Used in | Text |",
    "| --- | --- | --- |",
    ...Object.entries(TIPS).map(([k, t]) => `| \`TIPS.${k}\` | ${tipUses.get(k).map((f) => `\`${f}\``).join(", ") || "not used"} | ${cell(t)} |`),
    "",
    "## Help pages",
    "",
    "| Page | Address | Summary | Links |",
    "| --- | --- | --- | --- |",
    ...DOC_PAGES.map((p) => `| ${cell(p.title)} | \`#help/${p.id}\` | ${cell(p.summary)} | ${pageLinks(p).length} |`),
    "",
  ];

  for (const file of COPY_SOURCES) {
    const src = readFileSync(join(root, file), "utf8");
    const items = file.endsWith(".html") ? extractHtmlCopy(src) : extractJsCopy(src);
    lines.push(`## \`${file}\``, "");
    if (items.length === 0) {
      lines.push("No copy.", "");
      continue;
    }
    lines.push("| Kind | Text |", "| --- | --- |", ...items.map((x) => `| ${x.kind} | ${cell(x.text)} |`), "");
  }
  return lines.join("\n");
}

// Command line --------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const text = buildIndex(root);
  const path = join(root, COPY_INDEX);
  if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(path, "utf8"); } catch { /* missing */ }
    if (current !== text) {
      console.error(`${COPY_INDEX} is out of date. Run: node scripts/ui-copy.mjs`);
      process.exit(1);
    }
    console.log(`${COPY_INDEX} is up to date.`);
  } else {
    writeFileSync(path, text);
    console.log(`Wrote ${COPY_INDEX}.`);
  }
}
