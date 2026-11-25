// Tests for scripts/voice.mjs, the shared voice word lists, and for
// scripts/check-pr-text.mjs, the pull request check that reads the title,
// the description, and each commit message. Some words are built in parts,
// so this file passes the voice tests that read every code line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIRST_PERSON, THIRD_PERSON, SESSION, ATTRIBUTION, hasFirstPerson, hasThirdPerson, hasSession, hasAttribution, voiceProblems } from "../scripts/voice.mjs";
import { prTextProblems } from "../scripts/check-pr-text.mjs";

// Built in parts, so this file doesn't match the session check.
const SESSION_LINK = "https://claude.ai/code/" + "session_" + "01ABCDEFGHIJKLMNOP";
const TRAILER = "Claude-" + "Session: abc";

test("the shared lists are regular expressions", () => {
  for (const re of [FIRST_PERSON, THIRD_PERSON, SESSION, ATTRIBUTION]) assert.ok(re instanceof RegExp);
});

test("first-person words are found, and quoted text, code, and URLs are left out", () => {
  for (const line of ["Fix my lists", "We add a button", "This helps us", "I'm done", "Thanks to me"]) assert.ok(hasFirstPerson(line), line);
  for (const line of ['Ban the word "my"', "Run `git log --format=%B`", "See https://example.com/my/page", "Find My Combos links", "Use the i flag", "Add I/O"]) {
    assert.ok(!hasFirstPerson(line), line);
  }
});

test("third-person words for the person the app is built for are found, and quoted text is left out", () => {
  for (const line of ["Asked by the own" + "er", "S" + "he wants icons", "Her lists", "The developer asked"]) assert.ok(hasThirdPerson(line), line);
  for (const line of ['Never write "s' + 'he"', "Add the herb filter", "Show the card's other face"]) assert.ok(!hasThirdPerson(line), line);
});

test("session links, session trailers, and session IDs are found", () => {
  assert.ok(hasSession(SESSION_LINK));
  assert.ok(hasSession(TRAILER));
  assert.ok(hasSession("session_" + "01ABCDEFGHIJKL"));
  assert.ok(!hasSession("A session of play"));
});

test("the text check skips third-person words in code spans and URLs", () => {
  assert.deepEqual(voiceProblems("Run `gh api repos/{own" + "er}/{repo}`"), []);
  assert.deepEqual(voiceProblems("See https://github.com/x/her/y"), []);
  assert.equal(voiceProblems("Asked by the own" + "er").length, 1);
});

test("the text check skips tilde fences too", () => {
  assert.deepEqual(voiceProblems("Add it\n~~~\necho my lists\n~~~"), []);
});

test("co-author trailers and generated-with footers are found, but not a mention in prose", () => {
  assert.ok(!hasAttribution('- "Generated with" footers are banned'));
  assert.ok(!hasAttribution("`Co-Authored-By:` lines are banned"));
  assert.ok(hasAttribution("Co-Authored-By: Someone <a@example.com>"));
  assert.ok(hasAttribution("co-authored-by: someone"));
  assert.ok(hasAttribution("Generated with [a tool](https://example.com)"));
  assert.ok(hasAttribution("\u{1F916} Generated with a tool"));
  assert.ok(!hasAttribution("This check finds `Co-Authored-By` lines and footers."));
  assert.ok(!hasAttribution("The icons are generated with a script."));
});

test("voiceProblems names each kind of problem and its line, and skips fenced code", () => {
  const text = ["Add icons", "", "Fix my lists", "```", "echo my lists", "```", "S" + "he asked", TRAILER].join("\n");
  const problems = voiceProblems(text);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /line 3: first person/);
  assert.match(problems[1], /line 7: third person/);
  assert.match(problems[2], /line 8: Claude session/);
});

test("a clean pull request passes", () => {
  assert.deepEqual(prTextProblems({
    title: "Check pull request text",
    body: 'This change adds a check.\n\nIt bans words such as "my" and "s' + 'he".\n\nCloses #10',
    commits: [{ sha: "abc1234", message: "Add a check\n\n- Reads the title." }],
  }), []);
});

test("a bad title, body, or commit message fails, and each problem names where it is", () => {
  const problems = prTextProblems({
    title: "Check text for my lists",
    body: "Fine text.\n\n" + SESSION_LINK,
    commits: [
      { sha: "aaaaaaa1111", message: "Good commit" },
      { sha: "bbbbbbb2222", message: "Add a thing\n\nCo-Authored-By: Bot <bot@example.com>" },
    ],
  });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /^Title, line 1: first person/);
  assert.match(problems[1], /^Description, line 3: Claude session/);
  assert.match(problems[2], /^Commit bbbbbbb, line 3: attribution/);
});

test("merge commits get the session and attribution checks, but not the person checks", () => {
  assert.deepEqual(prTextProblems({ title: "Add a check", body: "", commits: [{ sha: "ccccccc3333", message: "Merge branch main into my branch", merge: true }] }), []);
  const problems = prTextProblems({ title: "Add a check", body: "", commits: [{ sha: "ccccccc3333", message: "Merge main\n\nCo-Authored-By: Bot <bot@example.com>", merge: true }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^Commit ccccccc, line 3: attribution/);
});

test("an empty description passes", () => {
  assert.deepEqual(prTextProblems({ title: "Fix a typo", body: "", commits: [] }), []);
});

test("the workflow runs the text check on pull requests and again when the text is edited", () => {
  const yml = readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");
  assert.match(yml, /types: \[[^\]]*\bedited\b[^\]]*\]/, "editing the title or description runs the check again");
  assert.match(yml, /^ {2}pr-text:$/m, "the job is named pr-text");
  assert.match(yml, /run: node scripts\/check-pr-text\.mjs/);
  assert.match(yml, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
  assert.match(yml, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.match(yml, /fetch-depth: 0/, "the check needs the commits of the pull request");
});

// Runs the script in a small repository whose HEAD is a merge commit, like
// the merge ref that GitHub checks out for a pull request. Main gets a
// commit with a bad message after the branch starts, and the branch merges
// main in once, so the test shows that only the branch's own commits count.
// Hooks are off, so a global commit-msg hook can't rewrite the messages.
function runInRepo({ branchMessages, env, mergeMessage = "Merge branch main into topic for my sake" }) {
  const dir = mkdtempSync(join(tmpdir(), "cascade-pr-text-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: dir, stdio: "ignore" });
  let n = 0;
  const commit = (message) => { writeFileSync(join(dir, `f${n++}.txt`), "x"); git("add", "."); git("commit", "-q", "-m", message); };
  try {
    git("init", "-q", "-b", "main");
    commit("Fix my old lists");
    git("switch", "-q", "-c", "topic");
    for (const m of branchMessages) commit(m);
    git("switch", "-q", "main");
    commit("Another old commit for my lists");
    git("switch", "-q", "topic");
    git("merge", "-q", "--no-ff", "-m", mergeMessage, "main");
    git("switch", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "Merge my topic", "topic");
    const script = fileURLToPath(new URL("../scripts/check-pr-text.mjs", import.meta.url));
    return spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the script passes good text and skips old commits on main and merge commits", () => {
  const r = runInRepo({ branchMessages: ["Add a check"], env: { PR_TITLE: "Add a check", PR_BODY: "Closes #10" } });
  assert.equal(r.status, 0, r.stderr);
});

test("the script fails a bad commit message in the pull request", () => {
  const r = runInRepo({ branchMessages: ["Add a check", "Fix my check"], env: { PR_TITLE: "Add a check", PR_BODY: "" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^Commit [0-9a-f]{7}, line 1: first person/m);
});

test("the script fails a bad title", () => {
  const r = runInRepo({ branchMessages: ["Add a check"], env: { PR_TITLE: "Add a check for her", PR_BODY: "" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Title, line 1: third person/);
});

test("the script fails a session trailer in a merge commit on the branch", () => {
  const r = runInRepo({ branchMessages: ["Add a check"], mergeMessage: "Merge main\n\n" + TRAILER, env: { PR_TITLE: "Add a check", PR_BODY: "" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Claude session/);
});

test("the script stops when it has no title", () => {
  assert.equal(runInRepo({ branchMessages: ["Add a check"], env: {} }).status, 2);
});
