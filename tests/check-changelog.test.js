// Tests for scripts/check-changelog.mjs, the pull request check that
// needs a changelog entry linked to the pull request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { changelogProblems, SKIP_LABEL } from "../scripts/check-changelog.mjs";

const PR = "https://github.com/armstrongl/scryfall-app/pull";
const entry = (n) => `# Changelog\n\n## 12 November 2026\n\n### Added\n\n- A thing. ([#${n}](${PR}/${n}))\n`;

test("a pull request that adds a linked entry passes", () => {
  assert.deepEqual(changelogProblems({ number: 40, labels: [], changedFiles: ["src/a.js", "CHANGELOG.md"], changelog: entry(40) }), []);
});

test("a pull request that doesn't change the changelog fails", () => {
  const problems = changelogProblems({ number: 40, labels: [], changedFiles: ["src/a.js"], changelog: entry(4) });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /doesn't change CHANGELOG\.md/);
  assert.match(problems[1], /no link to this pull request/);
});

test("an entry must link to this pull request, not one with a longer number", () => {
  const problems = changelogProblems({ number: 4, labels: [], changedFiles: ["CHANGELOG.md"], changelog: entry(40) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(`${PR}/4\\)`));
});

test("the skip label turns the check off", () => {
  assert.equal(SKIP_LABEL, "no-changelog");
  assert.deepEqual(changelogProblems({ number: 40, labels: ["no-changelog"], changedFiles: ["src/a.js"], changelog: "" }), []);
});

test("the workflow runs the tests and the changelog check on pull requests", () => {
  const yml = readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");
  assert.match(yml, /pull_request:/);
  assert.match(yml, /labeled/, "a label change runs the check again");
  assert.match(yml, /run: npm test/);
  assert.match(yml, /run: node scripts\/check-changelog\.mjs/);
  assert.match(yml, /fetch-depth: 2/, "the check compares the merge commit with its first parent");
  assert.match(yml, /concurrency:/, "a new push cancels the old run");
  // Event data goes through env, never straight into a command: every
  // expression sits on an env line or the concurrency group.
  const exprLines = yml.split("\n").filter((l) => l.includes("${{"));
  assert.ok(exprLines.length > 0);
  assert.deepEqual(exprLines.filter((l) => !/^\s+(?:[A-Z_]+: \$\{\{[^}]*\}\}|group: [-\w${}.|| ]+)$/.test(l)), []);
});

// Runs the script in a small repository whose HEAD is a merge commit, like
// the merge ref that GitHub checks out for a pull request.
function runInRepo({ branchFiles, env }) {
  const dir = mkdtempSync(join(tmpdir(), "cascade-changelog-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: dir, stdio: "ignore" });
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n");
    git("add", "."); git("commit", "-q", "-m", "Base");
    git("switch", "-q", "-c", "topic");
    for (const [name, text] of Object.entries(branchFiles)) writeFileSync(join(dir, name), text);
    git("add", "."); git("commit", "-q", "-m", "Change");
    git("switch", "-q", "main");
    writeFileSync(join(dir, "other.txt"), "x"); git("add", "."); git("commit", "-q", "-m", "Other");
    git("merge", "-q", "--no-ff", "-m", "Merge", "topic");
    const script = fileURLToPath(new URL("../scripts/check-changelog.mjs", import.meta.url));
    return spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the script passes a merge that adds a linked entry", () => {
  const r = runInRepo({ branchFiles: { "CHANGELOG.md": entry(7) }, env: { PR_NUMBER: "7" } });
  assert.equal(r.status, 0, r.stderr);
});

test("the script fails a merge with no entry, and the label skips it", () => {
  const r = runInRepo({ branchFiles: { "a.js": "x" }, env: { PR_NUMBER: "7" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /doesn't change CHANGELOG\.md/);
  const skipped = runInRepo({ branchFiles: { "a.js": "x" }, env: { PR_NUMBER: "7", PR_LABELS: '["no-changelog"]' } });
  assert.equal(skipped.status, 0, skipped.stderr);
});

test("the script stops when it has no pull request number", () => {
  assert.equal(runInRepo({ branchFiles: { "a.js": "x" }, env: {} }).status, 2);
});
