// Tests for the agent instructions: AGENTS.md, CLAUDE.md, the rules in
// .claude/rules/, the shared skills, and the committed Claude settings.
// They also check the voice of every text in the repository: no first
// person and no Claude session links. tests/docs.test.js checks the third person.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOC_PAGES, pageText } from "../src/docs.js";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8").replace(/\r\n/g, "\n");
const exists = (path) => existsSync(new URL(path, ROOT));

const CWD = new URL(".", ROOT);
const git = (args, opts = {}) => execFileSync("git", args, { cwd: CWD, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts });
let HAS_GIT = true;
try { git(["rev-parse", "--is-inside-work-tree"]); } catch { HAS_GIT = false; }

/** Every file under the root, for a copy with no git, such as a ZIP download. */
function walk(dir = "") {
  const skip = new Set([".git", ".artifacts", "node_modules", ".DS_Store"]);
  return readdirSync(new URL(dir || ".", ROOT), { withFileTypes: true }).flatMap((e) => {
    if (skip.has(e.name)) return [];
    const path = dir + e.name;
    return e.isDirectory() ? walk(path + "/") : [path];
  });
}

// Tracked files plus new files that are not ignored, so a test also sees
// files that are not committed yet. Without git, every file on disk.
const FILES = (HAS_GIT ? git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n") : walk())
  .filter((f) => f && exists(f));

const RULES = {
  "github-voice.md": null,
  "shipping.md": null,
  "design.md": ["styles.css", "index.html", "src/ui/**", "icons/**"],
  "scryfall-api.md": ["src/scryfall.js", "src/explore.js", "scripts/check-api.mjs", "scripts/fetch-fixtures.sh"],
  "storage-and-backups.md": ["src/storage/**", "src/export.js", "src/config.js"],
  "help-docs.md": ["src/docs.js", "README.md", "REPORT.md"],
};
const SKILLS = ["ship", "plan-with-options"];

/** The frontmatter of a Markdown file as { keys, paths }, or null. */
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const keys = [...m[1].matchAll(/^([A-Za-z_-]+):/gm)].map((k) => k[1]);
  const paths = [...m[1].matchAll(/^\s+-\s+"?([^"\n]+)"?$/gm)].map((p) => p[1]);
  const fields = Object.fromEntries([...m[1].matchAll(/^([A-Za-z_-]+):\s*(.+)$/gm)].map((f) => [f[1], f[2].trim()]));
  return { keys, paths, fields };
}
const globToRegExp = (glob) => new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*") + "$");

test("AGENTS.md stays under 200 lines", () => {
  const lines = read("AGENTS.md").split("\n").length;
  assert.ok(lines <= 200, `AGENTS.md has ${lines} lines`);
});

test("CLAUDE.md imports AGENTS.md first", () => {
  assert.equal(read("CLAUDE.md").split("\n")[0], "@AGENTS.md");
});

test("every rule exists, AGENTS.md links to it, and its paths are right", () => {
  const agents = read("AGENTS.md");
  for (const [name, paths] of Object.entries(RULES)) {
    const file = `.claude/rules/${name}`;
    assert.ok(exists(file), file);
    assert.ok(agents.includes(`(.claude/rules/${name})`), `AGENTS.md links to ${file}`);
    const fm = frontmatter(read(file));
    if (paths === null) {
      assert.equal(fm, null, `${file} loads every time, so it has no frontmatter`);
    } else {
      assert.deepEqual(fm.keys, ["paths"], `${file}: paths is the only field Claude Code reads`);
      assert.deepEqual(fm.paths, paths, file);
    }
  }
});

test("every path in a rule matches a file in the repository", () => {
  for (const [name, paths] of Object.entries(RULES)) {
    for (const glob of paths || []) {
      const re = globToRegExp(glob);
      assert.ok(FILES.some((f) => re.test(f)), `${name}: ${glob} matches nothing`);
    }
  }
});

test("every relative link in the agent docs points to a file that exists", () => {
  const docs = ["AGENTS.md", "CLAUDE.md", ...FILES.filter((f) => /^\.claude\/rules\/|^\.agents\/skills\//.test(f) && f.endsWith(".md"))];
  const broken = [];
  for (const doc of docs) {
    for (const [, target] of read(doc).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      const resolved = new URL(target, new URL(doc, ROOT));
      if (!existsSync(resolved)) broken.push(`${doc}: ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the shared skills exist for Codex and Claude Code", () => {
  for (const skill of SKILLS) {
    const file = `.agents/skills/${skill}/SKILL.md`;
    assert.ok(exists(file), file);
    const fm = frontmatter(read(file));
    assert.ok(fm, `${file} has frontmatter`);
    assert.equal(fm.fields.name, skill, `${file}: name matches the folder`);
    assert.ok(fm.fields.description && fm.fields.description.length <= 1024, `${file}: description`);
  }
  const link = new URL(".claude/skills", ROOT);
  assert.ok(lstatSync(link).isSymbolicLink(), ".claude/skills is a symlink");
  assert.equal(readlinkSync(link), "../.agents/skills");
});

test("the committed Claude settings turn off attribution and ask before a force push", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  assert.deepEqual(settings.attribution, { commit: "", pr: "", sessionUrl: false });
  for (const rule of ["Bash(git push --force*)", "Bash(git push -f*)", "Bash(git push * --force*)", "Bash(git push * -f*)"]) {
    assert.ok(settings.permissions.ask.includes(rule), rule);
  }
  assert.equal(settings.hooks, undefined, "hooks wait for issue work, not this file");
});

// Built in parts, so this file doesn't match its own check.
const SESSION = new RegExp(["claude\\.ai/code/" + "session", "Claude-" + "Session:", "session_" + "01[A-Za-z0-9]{10,}"].join("|"), "i");
const TEXT = /\.(md|js|mjs|json|html|css|sh|svg|webmanifest|txt|yml|yaml)$/;

test("no file mentions a Claude session", () => {
  const found = [];
  for (const file of FILES.filter((f) => TEXT.test(f) && !f.startsWith("tests/fixtures/"))) {
    read(file).split("\n").forEach((line, i) => { if (SESSION.test(line)) found.push(`${file}:${i + 1}`); });
  }
  assert.deepEqual(found, []);
});

// No first person anywhere: not in docs, help pages, interface copy, or code
// comments. Text in code spans, quotes, and proper names is left out.
const FIRST_PERSON = /\bI\b|\bI'(?:m|ve|d|ll)\b|\b(?:my|me|myself|mine|we|we're|we've|our|ours|us)\b/i;
const NAMES = /Find My Combos/g;
const strip = (line) => line.replace(/https?:\/\/\S+/g, "").replace(/`[^`]*`/g, "").replace(/"[^"]*"|“[^”]*”/g, "").replace(NAMES, "").replace(/\bI\/O\b/g, "");
const hasFirstPerson = (line) => FIRST_PERSON.test(strip(line).replace(/\bi\b/g, "i_"));

/** The comment text in one line of JavaScript, CSS, HTML, or shell. */
function commentText(line, file) {
  if (file.endsWith(".sh")) return line.match(/(?:^|\s)#(?!!)(.*)$/)?.[1] ?? "";
  const parts = [];
  const slashes = line.match(/(?:^|\s)\/\/(.*)$/); if (slashes) parts.push(slashes[1]);
  const block = line.match(/\/\*(.*?)(?:\*\/|$)/); if (block) parts.push(block[1]);
  const star = line.match(/^\s*\*\s?(.*)$/); if (star) parts.push(star[1]);
  const html = line.match(/<!--(.*?)(?:-->|$)/); if (html) parts.push(html[1]);
  return parts.join(" ");
}

test("the docs and agent instructions never use the first person", () => {
  const found = [];
  for (const file of FILES.filter((f) => f.endsWith(".md"))) {
    let fenced = false;
    read(file).split("\n").forEach((line, i) => {
      if (line.startsWith("```")) fenced = !fenced;
      if (!fenced && hasFirstPerson(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(found, []);
});

test("the help pages never use the first person", () => {
  const found = DOC_PAGES.filter((p) => pageText(p).split("\n").some(hasFirstPerson)).map((p) => p.id);
  assert.deepEqual(found, []);
});

test("interface copy never uses the first person", () => {
  const found = [];
  // Every string in every module under src/, and the text of index.html.
  // Template literals can span lines, so each file is read whole.
  for (const file of FILES.filter((f) => /^src\/.*\.js$/.test(f) || f === "index.html")) {
    const text = read(file).replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, "");
    const strings = file.endsWith(".html")
      ? [...text.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "\n").matchAll(/[^\n]+/g)].map((m) => m[0])
      : [...text.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    for (const s of strings) {
      // Paths and URLs, such as find-my-combos, are not copy.
      const copy = s.replace(/\S*\/\S*/g, "").replace(NAMES, "").replace(/\bi\b/g, "i_");
      if (FIRST_PERSON.test(copy)) found.push(`${file}: ${s.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(found, []);
});

test("code comments never use the first person", () => {
  const found = [];
  for (const file of FILES.filter((f) => /\.(js|mjs|css|html|sh)$/.test(f) && f !== "tests/agent-docs.test.js")) {
    read(file).split("\n").forEach((line, i) => {
      if (hasFirstPerson(commentText(line, file))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(found, []);
});

test("git keeps the shared .claude files, even with a global ignore for .claude", { skip: !HAS_GIT && "needs git" }, () => {
  // A global ignore file like the one on the development machines. With
  // --no-index, git checks the rules even for files that are committed.
  const dir = mkdtempSync(join(tmpdir(), "cascade-ignore-"));
  const excludes = join(dir, "gitignore");
  writeFileSync(excludes, ".claude\n**/.claude\n");
  const isIgnored = (f) => {
    try { git(["-c", `core.excludesFile=${excludes}`, "check-ignore", "-q", "--no-index", f]); return true; } catch { return false; }
  };
  try {
    const shared = [".claude/settings.json", ".claude/skills", ...Object.keys(RULES).map((n) => `.claude/rules/${n}`)];
    assert.deepEqual(shared.filter(isIgnored), [], "shared files are kept");
    const personal = [".claude/settings.local.json", ".claude/log/notes.md"];
    assert.deepEqual(personal.filter((f) => !isIgnored(f)), [], "personal files stay ignored");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
