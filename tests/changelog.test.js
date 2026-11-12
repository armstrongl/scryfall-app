// Tests for CHANGELOG.md: its shape, and that every pull request merged
// into main has an entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8").replace(/\r\n/g, "\n");

const REPO_URL = "https://github.com/armstrongl/scryfall-app";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const SECTIONS = ["Added", "Changed", "Fixed", "Removed", "Project"];

let HAS_GIT = true;
try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, stdio: "ignore" });
} catch { HAS_GIT = false; }

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

const SHALLOW = HAS_GIT && execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: ROOT, encoding: "utf8" }).trim() === "true";

test("every pull request merged into main has a changelog entry", { skip: (!HAS_GIT && "needs git") || (SHALLOW && "needs the full history, not a shallow clone") }, () => {
  const log = execFileSync("git", ["log", "--first-parent", "--format=%s", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  const merged = [...log.matchAll(/^Merge pull request #(\d+)/gm)].map((m) => m[1]);
  const missing = merged.filter((n) => !text().includes(`${REPO_URL}/pull/${n})`));
  assert.deepEqual(missing, [], "pull requests with no entry");
});

test("the agent instructions say to keep the changelog in step", () => {
  const agents = read("AGENTS.md");
  const table = agents.slice(agents.indexOf("## Keep the docs in step"));
  assert.match(table, /CHANGELOG\.md/);
  assert.match(read(".claude/rules/shipping.md"), /CHANGELOG\.md/);
});
