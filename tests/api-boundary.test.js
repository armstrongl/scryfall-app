// Only src/scryfall.js talks to the Scryfall API, through its queue. These
// tests read the source of every browser module to keep it that way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);

/** Every JavaScript file under src/, as a path such as "src/ui/app.js". */
function modules(dir = "") {
  return readdirSync(new URL(dir || ".", SRC), { withFileTypes: true }).flatMap((e) => {
    const path = dir + e.name;
    if (e.isDirectory()) return modules(path + "/");
    return /\.m?js$/.test(e.name) ? [`src/${path}`] : [];
  });
}
const source = (file) => readFileSync(new URL(file.slice(4), SRC), "utf8");

test("no module other than src/scryfall.js refers to the Scryfall API", () => {
  // src/config.js defines API_BASE, and src/scryfall.js is the only module
  // that may use it.
  const found = modules()
    .filter((f) => f !== "src/scryfall.js" && f !== "src/config.js")
    .filter((f) => /api\.scryfall\.com|\bAPI_BASE\b/.test(source(f)));
  assert.deepEqual(found, []);
});

test("only src/scryfall.js and src/github.js call fetch", () => {
  // Commander Spellbook is linked, never fetched, and GitHub sync has its
  // own module. A new fetch anywhere else needs a rule first.
  const found = modules()
    .filter((f) => f !== "src/scryfall.js" && f !== "src/github.js")
    .filter((f) => /\bfetch\s*\(/.test(source(f).replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, "")));
  assert.deepEqual(found, []);
});
