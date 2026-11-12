// Tests for CHANGELOG.md: its shape and its links. The changelog check on
// GitHub (scripts/check-changelog.mjs) makes sure each pull request adds an entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8").replace(/\r\n/g, "\n");

const REPO_URL = "https://github.com/armstrongl/scryfall-app";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const SECTIONS = ["Added", "Changed", "Fixed", "Removed", "Project"];


const text = () => read("CHANGELOG.md");

test("CHANGELOG.md exists and starts with its title", () => {
  assert.ok(existsSync(new URL("CHANGELOG.md", ROOT)), "CHANGELOG.md is missing");
  assert.equal(text().split("\n")[0], "# Changelog");
});

test("the changelog's dates are real, unique, and newest first", () => {
  const headings = [...text().matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.ok(headings.length > 0, "no date headings");
  const times = headings.map((h) => {
    const m = h.match(/^(\d{1,2}) (\w+) (\d{4})$/);
    assert.ok(m && MONTHS.includes(m[2]), `"${h}" is not a date such as "12 November 2026"`);
    const time = Date.UTC(Number(m[3]), MONTHS.indexOf(m[2]), Number(m[1]));
    assert.equal(new Date(time).getUTCDate(), Number(m[1]), `"${h}" is not a real date`);
    assert.ok(time <= Date.now() + 86_400_000, `"${h}" is in the future`);
    return time;
  });
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] < times[i - 1], `"${headings[i]}" must come after "${headings[i - 1]}"`);
  }
});

test("the changelog uses only the agreed section names", () => {
  const sections = [...text().matchAll(/^### (.+)$/gm)].map((m) => m[1]);
  assert.ok(sections.length > 0, "no sections");
  assert.deepEqual(sections.filter((s) => !SECTIONS.includes(s)), []);
});

test("every changelog entry links to its pull request or commit", () => {
  // Entries are the bullets under the date headings, not the intro.
  const bullets = text().slice(text().indexOf("\n## ")).split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length > 0, "no entries");
  const link = new RegExp(`\\(${REPO_URL.replace(/[.]/g, "\\.")}/(?:pull/\\d+|commit/[0-9a-f]{7,40})\\)`);
  assert.deepEqual(bullets.filter((b) => !link.test(b)), [], "entries with no link");
});

test("the agent instructions say to keep the changelog in step", () => {
  const agents = read("AGENTS.md");
  const table = agents.slice(agents.indexOf("## Keep the docs in step"));
  assert.match(table, /CHANGELOG\.md/);
  assert.match(read(".claude/rules/shipping.md"), /CHANGELOG\.md/);
});
