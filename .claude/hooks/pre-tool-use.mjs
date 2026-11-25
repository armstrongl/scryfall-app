// The PreToolUse hook for Claude Code, registered in .claude/settings.json.
// It reads the hook input on stdin (https://code.claude.com/docs/en/hooks)
// and prints a decision only when a rule applies:
//
// - Deny a commit message, tag or merge message, or a pull request, issue,
//   release, or comment text that breaks .claude/rules/github-voice.md. It
//   checks Bash commands (git and gh) and the GitHub MCP tools.
// - Ask before a force push in any form, since a permission rule such as
//   Bash(git push --force*) doesn't match "git -C . push --force".
// - Deny an edit that brings the Scryfall API into a module other than
//   src/scryfall.js, whose queue every API request must go through.
//
// It fails safe: input it can't read, or any error, gives no decision, so
// the normal permission flow applies. It never allows a tool call.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseShell } from "./shell.mjs";
import { expandCatHeredocs, voiceProblems } from "./voice.mjs";

const REPO = "armstrongl/scryfall-app";
const RULE = ".claude/rules/github-voice.md";
const MAX_FILE = 1024 * 1024;

/** True when a GitHub "owner/repo" or remote URL names this repository. */
const isOurRepo = (name) => new RegExp(`(^|[/:])${REPO}(\\.git)?/?$`, "i").test(name.trim());

const expandHome = (path) => (path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

/** The text of a file named in a command, or "" when it can't be read. */
function readText(path, dir, cmd) {
  if (path === "-") return cmd.stdin ?? (cmd.stdinFile ? readText(cmd.stdinFile, dir, { stdin: "" }) : "");
  const file = resolve(dir, expandHome(path));
  try {
    if (!existsSync(file) || statSync(file).size > MAX_FILE) return "";
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** The origin remote of the repository at dir, or null. */
function remoteOf(dir) {
  try {
    return execFileSync("git", ["-C", dir, "config", "--get", "remote.origin.url"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

/** Skips VAR=value words and wrappers such as env, and returns the rest. */
function program(words) {
  const wrappers = new Set(["env", "command", "exec", "nohup", "time", "sudo", "builtin"]);
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || wrappers.has(words[i]))) i++;
  const rest = words.slice(i);
  if (rest[0]) rest[0] = rest[0].split("/").pop();
  return rest;
}

/**
 * The messages that a git commit, tag, or merge would write, from -m, -F,
 * and --trailer.
 */
function gitMessages(args, dir, cmd) {
  const texts = [];
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === "--") break;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq < 0 ? a : a.slice(0, eq);
      const value = () => (eq < 0 ? args[++j] ?? "" : a.slice(eq + 1));
      if (name === "--message" || name === "--trailer") texts.push(value());
      else if (name === "--file") texts.push(readText(value(), dir, cmd));
      continue;
    }
    if (/^-[^-]/.test(a)) {
      for (let k = 1; k < a.length; k++) {
        const f = a[k];
        // -m, -F, -C, -c, and -t take a value. -S and -u take an optional
        // value in the same word.
        if ("mFCct".includes(f)) {
          const value = a.slice(k + 1) || args[++j] || "";
          if (f === "m") texts.push(value);
          if (f === "F") texts.push(readText(value, dir, cmd));
          break;
        }
        if (f === "S" || f === "u") break;
      }
    }
  }
  return texts;
}

/** True when a git push forces: --force, -f, --force-with-lease, --mirror, or a +refspec. */
function isForcePush(args) {
  return args.some((a) =>
    /^--(force|force-with-lease|mirror)(=|$)/.test(a) ||
    /^-[^-]*f/.test(a) ||
    /^\+[^\s]/.test(a));
}

const GH_TEXT_SUBS = {
  pr: new Set(["create", "edit", "comment", "review", "merge"]),
  issue: new Set(["create", "edit", "comment"]),
  release: new Set(["create", "edit"]),
};
const GH_TEXT_FLAGS = new Set(["-t", "--title", "--subject", "-b", "--body", "-n", "--notes"]);
const GH_FILE_FLAGS = new Set(["-F", "--body-file", "--notes-file"]);
const TEXT_KEYS = new Set(["title", "body", "message", "subject", "notes", "commit_title", "commit_message"]);

/** The value of a gh flag such as -R or --repo, or null. */
function flagValue(args, short, long) {
  for (let j = 0; j < args.length; j++) {
    if (args[j] === short || args[j] === long) return args[j + 1] ?? null;
    if (args[j].startsWith(long + "=")) return args[j].slice(long.length + 1);
  }
  return null;
}

/** Strings under the text keys of a JSON value, such as an MCP tool input. */
function jsonTexts(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => jsonTexts(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (TEXT_KEYS.has(k) && typeof v === "string") out.push(v);
      else if (typeof v === "object") jsonTexts(v, out);
    }
  }
  return out;
}

/** The texts a gh command would post, and the repository it posts to. */
function ghTexts(args, dir, cmd) {
  const repo = flagValue(args, "-R", "--repo");
  const [group, sub] = args;
  const texts = [];
  if (GH_TEXT_SUBS[group]?.has(sub)) {
    for (let j = 2; j < args.length; j++) {
      const a = args[j];
      const eq = a.startsWith("--") ? a.indexOf("=") : -1;
      const name = eq < 0 ? (/^-[A-Za-z]./.test(a) ? a.slice(0, 2) : a) : a.slice(0, eq);
      const attached = eq >= 0 ? a.slice(eq + 1) : name !== a ? a.slice(2).replace(/^=/, "") : null;
      if (!GH_TEXT_FLAGS.has(name) && !GH_FILE_FLAGS.has(name)) continue;
      const value = attached ?? args[++j] ?? "";
      texts.push(GH_FILE_FLAGS.has(name) ? readText(value, dir, cmd) : value);
    }
    return { texts, repo };
  }
  if (group === "api") {
    const endpoint = args.slice(1).find((a) => !a.startsWith("-") && /\//.test(a)) ?? "";
    const m = endpoint.match(/repos\/([^/]+\/[^/?]+)/);
    for (let j = 1; j < args.length; j++) {
      const a = args[j];
      if (["-f", "--raw-field", "-F", "--field"].includes(a)) {
        const field = args[++j] ?? "";
        const eq = field.indexOf("=");
        const key = field.slice(0, eq).split(/[[\]]/).filter(Boolean).pop();
        const value = field.slice(eq + 1);
        if (eq < 0 || !TEXT_KEYS.has(key)) continue;
        texts.push((a === "-F" || a === "--field") && value.startsWith("@") ? readText(value.slice(1), dir, cmd) : value);
      } else if (a === "--input") {
        try { jsonTexts(JSON.parse(readText(args[++j] ?? "", dir, cmd)), texts); } catch { /* not JSON */ }
      }
    }
    return { texts, repo: repo ?? (m ? m[1] : null) };
  }
  return { texts, repo };
}

/**
 * The decision for a Bash command: { decision, reason } or null.
 * @param {string} command
 * @param {string} cwd
 */
export function checkBash(command, cwd) {
  const problems = [];
  let force = false;
  let dir = cwd;
  for (const cmd of parseShell(command)) {
    const w = program(cmd.words);
    if (w[0] === "cd" && w[1]) { dir = resolve(dir, expandHome(w[1])); continue; }
    if (w[0] === "git") {
      let i = 1;
      let gitDir = dir;
      while (i < w.length && w[i].startsWith("-")) {
        if (w[i] === "-C") { gitDir = resolve(gitDir, expandHome(w[i + 1] ?? ".")); i += 2; }
        else if (["-c", "--git-dir", "--work-tree", "--namespace"].includes(w[i])) i += 2;
        else i++;
      }
      const [sub, ...args] = w.slice(i);
      if (sub === "push" && isForcePush(args)) force = true;
      if (sub === "commit" || sub === "tag" || sub === "merge") {
        const texts = gitMessages(args, gitDir, cmd);
        if (texts.length) {
          const remote = remoteOf(gitDir);
          const ownRepo = !remote || isOurRepo(remote);
          for (const t of texts) problems.push(...voiceProblems(expandCatHeredocs(t), { ownRepo }));
        }
      }
    }
    if (w[0] === "gh") {
      const { texts, repo } = ghTexts(w.slice(1), dir, cmd);
      if (texts.length) {
        const target = repo ?? remoteOf(dir);
        const ownRepo = !target || isOurRepo(target);
        for (const t of texts) problems.push(...voiceProblems(expandCatHeredocs(t), { ownRepo }));
      }
    }
  }
  if (problems.length) return deny(problems);
  if (force) return { decision: "ask", reason: "This is a force push. It can overwrite commits on GitHub. .claude/settings.json asks before every force push, in any form." };
  return null;
}

/** The decision for a GitHub MCP tool call, or null. */
export function checkGitHubTool(input) {
  const texts = jsonTexts(input);
  const ownRepo = !(input.owner && input.repo) || isOurRepo(`${input.owner}/${input.repo}`);
  const problems = texts.flatMap((t) => voiceProblems(t, { ownRepo }));
  return problems.length ? deny(problems) : null;
}

/** The decision for an Edit, MultiEdit, or Write call, or null. */
export function checkEdit(input, projectDir) {
  const path = input.file_path;
  if (!path || !projectDir) return null;
  const rel = relative(projectDir, isAbsolute(path) ? path : resolve(projectDir, path)).split("\\").join("/");
  if (!/^src\/.*\.m?js$/.test(rel) || rel === "src/scryfall.js" || rel === "src/config.js") return null;
  const text = [input.content, input.new_string, ...(input.edits || []).map((e) => e.new_string)].filter((t) => typeof t === "string").join("\n");
  if (!/api\.scryfall\.com|\bAPI_BASE\b/.test(text)) return null;
  return {
    decision: "deny",
    reason: `${rel} must not call the Scryfall API. Every request to api.scryfall.com goes through the queue in src/scryfall.js (AGENTS.md, "Scryfall API"). Add a function to src/scryfall.js and call it instead.`,
  };
}

function deny(problems) {
  const unique = [...new Set(problems)];
  return {
    decision: "deny",
    reason: `This text breaks the voice rules in ${RULE}:\n- ${unique.join("\n- ")}\nRewrite it impersonally, then run the command again. Quote a banned word in "double quotes" or a code span when the text needs to name it.`,
  };
}

/** The decision for one hook input, or null. */
export function decide(input) {
  const tool = input?.tool_name ?? "";
  const toolInput = input?.tool_input ?? {};
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input?.cwd;
  if (tool === "Bash" && typeof toolInput.command === "string") return checkBash(toolInput.command, input.cwd || process.cwd());
  if (/^mcp__(plugin_.*_)?github__/.test(tool)) return checkGitHubTool(toolInput);
  if (["Edit", "MultiEdit", "Write"].includes(tool)) return checkEdit(toolInput, projectDir);
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = decide(JSON.parse(readFileSync(0, "utf8")));
    if (result) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: result.decision, permissionDecisionReason: result.reason },
      }) + "\n");
    }
  } catch {
    // Fail safe: no decision.
  }
  process.exit(0);
}
