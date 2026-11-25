// Tests for the Claude Code hooks in .claude/hooks/ and the git commit-msg
// hook in .githooks/. Each hook script gets real hook input on stdin, in the
// shape that https://code.claude.com/docs/en/hooks documents, and the test
// checks the decision it prints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRE = join(ROOT, ".claude/hooks/pre-tool-use.mjs");
const STOP = join(ROOT, ".claude/hooks/stop.mjs");
const COMMIT_MSG = join(ROOT, ".githooks/commit-msg");

// Built in parts, so this file doesn't match the voice checks of the tests
// that read every file in the repository.
const SESSION_LINK = "https://claude.ai/code/" + "session_" + "01AbCdEfGhIjKlMnOpQr";
const SESSION_TRAILER = "Claude-" + "Session: " + SESSION_LINK;
const PRONOUN = "s" + "he";
const OWNER = "the " + "owner";

/** Runs a hook script with JSON input and returns { status, out, err }. */
function run(script, input, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
  });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

/** PreToolUse input for a tool call, as Claude Code sends it. */
function preInput(tool_name, tool_input, cwd = ROOT) {
  return {
    session_id: "abc123",
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name,
    tool_input,
    tool_use_id: "toolu_01ABC123",
  };
}
const bash = (command, cwd) => preInput("Bash", { command, description: "Run a command" }, cwd);

/** The permission decision of a PreToolUse run, or null for no decision. */
function decision(input) {
  const r = run(PRE, input);
  assert.equal(r.status, 0, `exit 0, stderr: ${r.err}`);
  if (!r.out) return null;
  const out = JSON.parse(r.out).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.ok(out.permissionDecisionReason, "a decision has a reason");
  return { decision: out.permissionDecision, reason: out.permissionDecisionReason };
}
const denied = (input, pattern) => {
  const d = decision(input);
  assert.equal(d?.decision, "deny", `denied: ${JSON.stringify(input.tool_input)}`);
  if (pattern) assert.match(d.reason, pattern);
};
const allowed = (input) => assert.equal(decision(input), null, `no decision: ${JSON.stringify(input.tool_input)}`);

const tmp = () => mkdtempSync(join(tmpdir(), "cascade-hooks-"));

// PreToolUse: commit messages, pull requests, issues, and comments.

test("the PreToolUse hook blocks a commit message in the first person", () => {
  denied(bash(`git commit -m "Fix the queue so I can retry"`), /first person/i);
  denied(bash(`cd ${ROOT} && git commit -am "Update my notes"`), /first person/i);
  denied(bash(`git commit --message="Add hooks" -m 'We keep the queue'`), /first person/i);
});

test("the PreToolUse hook reads a commit message from a heredoc", () => {
  const cmd = `git commit -m "$(cat <<'EOF'\nAdd hooks\n\nThis doesn't change the queue; we keep it.\nEOF\n)"`;
  denied(bash(cmd), /first person/i);
  denied(bash(`git commit -F - <<'EOF'\nAdd hooks\n\nCo-Authored-By: Someone <someone@example.com>\nEOF`), /Co-Authored-By/i);
});

test("the PreToolUse hook blocks a Claude session link, trailer, or ID", () => {
  denied(bash(`git -C ${ROOT} commit -m "Add hooks" -m "${SESSION_LINK}"`), /session/i);
  denied(bash(`git commit -m "Add hooks" --trailer "${SESSION_TRAILER}"`), /session/i);
  denied(bash(`gh pr create --title "Add hooks" --body "See ${SESSION_LINK}"`), /session/i);
});

test("the PreToolUse hook blocks third-person words in a pull request or issue", () => {
  denied(bash(`gh pr create --title "Add hooks" --body "Requested by ${OWNER}."`), /third person/i);
  denied(bash(`gh issue comment 9 -b "Done, as ${PRONOUN} asked."`), /third person/i);
  denied(bash(`gh pr edit 5 --title "Fix what ${PRONOUN} found"`), /third person/i);
});

test("the PreToolUse hook reads a body file and blocks a Generated with footer", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "body.md"), "## What changed\n\nAdds hooks.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n");
    denied(bash(`gh pr create --title "Add hooks" --body-file body.md`, dir), /Generated with/i);
    denied(bash(`cd ${dir} && gh pr create -t "Add hooks" -F body.md`, ROOT), /Generated with/i);
    denied(bash(`gh pr create --title "Add hooks" --body-file - < body.md`, dir), /Generated with/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the PreToolUse hook checks gh api fields and GitHub MCP tools", () => {
  denied(bash(`gh api repos/armstrongl/scryfall-app/issues/9/comments -f body='I think this works'`), /first person/i);
  denied(preInput("mcp__github__create_pull_request", { owner: "armstrongl", repo: "scryfall-app", title: "Add hooks", body: "We added hooks." }), /first person/i);
  denied(preInput("mcp__plugin_github_github__add_issue_comment", { owner: "armstrongl", repo: "scryfall-app", issue_number: 9, body: `Fixed, as ${PRONOUN} asked.` }), /third person/i);
});

test("the PreToolUse hook allows normal work", () => {
  for (const command of [
    "npm test",
    "node --test tests/hooks.test.js",
    "git status && git diff",
    `git commit -m "Add Claude Code hooks for the agent rules" -m "- Block session links in commit messages and pull requests."`,
    `git commit -F - <<'EOF'\nAdd hooks\n\nThis doesn't change the queue. It's safe.\nEOF`,
    `cd ~/worktrees/my-thing && git commit -m "Fix the draw count"`,
    `gh pr create --title "Add hooks" --body "Closes #9. The user can draw cards. Bans \\"we\\" and \`my\` in text."`,
    `gh pr create --title "Fix the sync errors" --body "Fixes I/O errors."`,
    `git commit -m "Rebuild the copy index" -m "The index is\n  generated by scripts/ui-copy.mjs each time."`,
    `gh pr create --title "Add hooks" --body "$(cat <<'EOF'\n## What changed\n\n- Adds a hook (in \`.claude/hooks/\`). It doesn't block \`npm test\`.\n- The hook's reason says what to fix.\n\n## Tests\n\n\`\`\`\nnode --test tests/hooks.test.js\n\`\`\`\n\nCloses #9.\nEOF\n)"`,
    "until gh pr checks | grep -q changelog; do sleep 5; done; gh pr checks --watch",
    `grep -q "pull/$(gh pr view --json number -q .number))" CHANGELOG.md`,
    `test -e "$(git rev-parse --git-path hooks/commit-msg)" || cp .githooks/commit-msg "$(git rev-parse --git-path hooks/commit-msg)"`,
    "git push --follow-tags",
    "git push origin :old-branch",
    "git push origin --delete agent-hooks",
    "gh pr merge --merge --delete-branch",
    "gh pr checks --watch",
    "gh pr view --json number -q .number",
    `grep -rn "I think" src | head`,
    "git push -u origin agent-hooks",
    `git log --format="%s" -5`,
  ]) allowed(bash(command));
});

test("the PreToolUse hook finds commands inside compound commands, substitutions, and pipes", () => {
  for (const command of [
    `if true; then git commit -m "We fix it"; fi`,
    `for f in a; do git commit -m "We fix it"; done`,
    `{ git commit -m "We fix it"; }`,
    `! git commit -m "We fix it"`,
    `env -u FOO git commit -m "We fix it"`,
    `bash -c 'git commit -m "We fix it"'`,
    `echo "$(gh pr create --title Fix --body 'We did it')"`,
    `cat <<'EOF' | gh pr create --title Fix --body-file -\nWe did it.\nEOF`,
    `gh issue close 9 -c "We fixed it"`,
    `gh pr close 5 --comment "We fixed it"`,
    `gh api repos/{owner}/{repo}/issues/9/comments -f body='We fixed it'`,
  ]) denied(bash(command), /first person/i);
});

test("the PreToolUse hook applies only session and attribution rules to other repositories", () => {
  allowed(bash(`GH_REPO=someone/other gh issue create --title "Bug" --body "I found it"`));
  allowed(bash(`gh pr create -R someone/other --title "Fix" --body "I fixed my bug."`));
  allowed(preInput("mcp__github__create_issue", { owner: "someone", repo: "other", title: "Bug", body: "I found a bug." }));
  denied(preInput("mcp__github__create_issue", { owner: "someone", repo: "other", title: "Bug", body: "Co-Authored-By: Someone <a@b.c>" }), /Co-Authored-By/i);
});

test("the PreToolUse hook asks before a force push in any form", () => {
  for (const command of [
    "git push --force",
    `git -C ${ROOT} push --force origin main`,
    "git push origin +main",
    "git push -uf origin agent-hooks",
    "git push --force-with-lease origin agent-hooks",
  ]) {
    assert.equal(decision(bash(command))?.decision, "ask", command);
  }
});

test("the PreToolUse hook keeps Scryfall API calls in src/scryfall.js", () => {
  const edit = (file, new_string) => preInput("Edit", { file_path: join(ROOT, file), old_string: "x", new_string });
  denied(edit("src/explore.js", `const res = await fetch(API_BASE + "/cards/search");`), /src\/scryfall\.js/);
  denied(preInput("Write", { file_path: join(ROOT, "src/ui/new.js"), content: `fetch("https://api.scryfall.com/cards/named")` }), /src\/scryfall\.js/);
  allowed(edit("src/scryfall.js", `res = await fetchImpl(API_BASE + item.path);`));
  allowed(edit("src/ui/results.js", `h("a", { href: "https://scryfall.com/search?q=t%3Aelf" })`));
  allowed(edit("scripts/check-api.mjs", `await fetch("https://api.scryfall.com/cards/named")`));
});

test("the PreToolUse hook works when started through a symlinked path", () => {
  const dir = tmp();
  try {
    symlinkSync(ROOT, join(dir, "repo"));
    const r = run(join(dir, "repo/.claude/hooks/pre-tool-use.mjs"), bash(`git commit -m "We fix it"`));
    assert.equal(JSON.parse(r.out || "{}").hookSpecificOutput?.permissionDecision, "deny");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the PreToolUse hook fails safe on input it can't read", () => {
  for (const input of ["", "not json", JSON.stringify({ tool_name: "Bash" }), JSON.stringify(bash(`git commit -m "unclosed`))]) {
    const r = run(PRE, input);
    assert.equal(r.status, 0, input);
    assert.equal(r.out, "", input);
  }
});

// Stop: a reminder to run the tests when files changed.

function stopInput(cwd, active = false) {
  return { session_id: "abc123", transcript_path: "/tmp/t.jsonl", cwd, permission_mode: "default", hook_event_name: "Stop", stop_hook_active: active, last_assistant_message: "Done." };
}

test("the Stop hook reminds once to run the tests when files changed", () => {
  const dir = tmp();
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  try {
    git("init", "-q");
    writeFileSync(join(dir, "a.js"), "export const a = 1;\n");
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Start");

    assert.equal(run(STOP, stopInput(dir)).out, "", "a clean tree gets no reminder");

    writeFileSync(join(dir, "a.js"), "export const a = 2;\n");
    const r = run(STOP, stopInput(dir));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.out);
    assert.equal(out.decision, undefined, "a reminder, not a block");
    assert.equal(out.hookSpecificOutput.hookEventName, "Stop");
    assert.match(out.hookSpecificOutput.additionalContext, /npm test/);

    assert.equal(run(STOP, stopInput(dir)).out, "", "the same changes get no second reminder");
    writeFileSync(join(dir, "b.js"), "export const b = 1;\n");
    assert.match(run(STOP, stopInput(dir, true)).out, /^$/, "no reminder while a stop hook is already active");
    assert.match(run(STOP, stopInput(dir)).out, /npm test/, "new changes get a new reminder");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the Stop hook sees changes to untracked files from a subfolder", () => {
  const dir = tmp();
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  try {
    git("init", "-q");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub/a.js"), "export const a = 1;\n");
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Start");
    writeFileSync(join(dir, "sub/new.js"), "1\n");
    assert.match(run(STOP, stopInput(join(dir, "sub"))).out, /npm test/);
    writeFileSync(join(dir, "sub/new.js"), "a longer file\n");
    assert.match(run(STOP, stopInput(join(dir, "sub"))).out, /npm test/, "an edit to an untracked file gets a new reminder");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the Stop hook fails safe outside a git repository and on bad input", () => {
  const dir = tmp();
  try {
    for (const input of [stopInput(dir), "not json", ""]) {
      const r = run(STOP, input);
      assert.equal(r.status, 0);
      assert.equal(r.out, "");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The git commit-msg hook: a copy of the global one, for every worktree.

test("the commit-msg hook removes Claude session references", () => {
  const dir = tmp();
  try {
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, `Add hooks\n\nBlocks bad text.\n\n${SESSION_TRAILER}\n`);
    execFileSync("sh", [COMMIT_MSG, file], { stdio: "ignore" });
    assert.equal(readFileSync(file, "utf8"), "Add hooks\n\nBlocks bad text.\n");

    writeFileSync(file, "Add hooks\n\nSee the plan.\n");
    execFileSync("sh", [COMMIT_MSG, file], { stdio: "ignore" });
    assert.equal(readFileSync(file, "utf8"), "Add hooks\n\nSee the plan.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
