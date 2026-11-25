// The Stop hook for Claude Code, registered in .claude/settings.json. When
// the working tree has changes that aren't committed, it reminds the agent
// once to run npm test before it finishes. The reminder is feedback, not a
// block: the agent can answer it and stop.
//
// It reminds once for each set of changes. A fingerprint of the last set it
// reminded about is kept in the worktree's git folder. It fails safe: any
// error gives no output.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, maxBuffer: 64 * 1024 * 1024 });

/** A fingerprint of the changes that aren't committed, or null for none. */
export function changesFingerprint(dir) {
  const status = git(dir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!status) return null;
  const hash = createHash("sha256").update(status);
  try { hash.update(git(dir, ["diff", "HEAD"])); } catch { /* no commit yet */ }
  // Untracked files have no diff, so their size and time stand in for it.
  for (const entry of status.split("\0")) {
    if (!entry.startsWith("?? ")) continue;
    try {
      const s = statSync(resolve(dir, entry.slice(3)));
      hash.update(`${entry}:${s.size}:${s.mtimeMs}`);
    } catch { /* gone */ }
  }
  return hash.digest("hex");
}

/** The reminder for one Stop input, or null. */
export function reminder(input) {
  if (!input || input.stop_hook_active) return null;
  const dir = input.cwd || process.cwd();
  const fingerprint = changesFingerprint(dir);
  if (!fingerprint) return null;
  const stateFile = resolve(dir, git(dir, ["rev-parse", "--git-path", "cascade-stop-hook"]).trim());
  let last = "";
  try { last = readFileSync(stateFile, "utf8").trim(); } catch { /* first run */ }
  if (last === fingerprint) return null;
  writeFileSync(stateFile, fingerprint + "\n");
  return "Files changed since the last commit. If npm test hasn't run since the last edit, run it now. Then go through \"Before you finish\" in AGENTS.md. If the tests already passed, stop.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const text = reminder(JSON.parse(readFileSync(0, "utf8")));
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: text } }) + "\n");
  } catch {
    // Fail safe: no output.
  }
  process.exit(0);
}
