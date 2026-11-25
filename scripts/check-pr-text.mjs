// The pull request text check, run by .github/workflows/check.yml. It reads
// the title, the description, and the message of each commit that the pull
// request adds, and fails on first-person or third-person words, Claude
// session links, and attribution lines. The word lists are in voice.mjs.
//
// Environment: PR_TITLE and PR_BODY. Run it from the repository root, with
// HEAD at the merge commit that GitHub checks out for a pull request and the
// full history fetched. HEAD^1 is main and HEAD^2 is the branch, so
// HEAD^1..HEAD^2 holds exactly the commits that the pull request adds. Merge
// commits get only the session and attribution checks: git writes the rest
// of their messages.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { voiceProblems } from "./voice.mjs";

/**
 * The reasons the text of a pull request fails the check, or none.
 * @param {{title: string, body: string, commits: {sha: string, message: string, merge?: boolean}[]}} pr
 * @returns {string[]}
 */
export function prTextProblems({ title, body, commits }) {
  const where = (label, text, options) => voiceProblems(text, options).map((p) => `${label}, ${p}`);
  return [
    ...where("Title", title),
    ...where("Description", body),
    ...commits.flatMap((c) => where(`Commit ${c.sha.slice(0, 7)}`, c.message, { person: !c.merge })),
  ];
}

/** The commits in a range, oldest first, with merge set on merge commits. */
export function rangeCommits(range, cwd = process.cwd()) {
  const out = execFileSync("git", ["log", "--reverse", "--format=%H %P%x00%B%x01", range], { cwd, encoding: "utf8" });
  return out.split("\x01").map((s) => s.replace(/^\n/, "")).filter(Boolean).map((s) => {
    const [ids, message] = s.split("\x00");
    const [sha, ...parents] = ids.trim().split(" ");
    return { sha, message: message.trimEnd(), merge: parents.length > 1 };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const title = process.env.PR_TITLE;
  if (!title) {
    console.error("Set PR_TITLE.");
    process.exit(2);
  }
  const problems = prTextProblems({ title, body: process.env.PR_BODY || "", commits: rangeCommits("HEAD^1..HEAD^2") });
  for (const p of problems) console.error(p);
  if (problems.length) {
    console.error("Fix the words above. .claude/rules/github-voice.md has the rules. Quoted text, code spans, URLs, and fenced code are left out of the person checks.");
    process.exit(1);
  }
  console.log("The title, description, and commit messages pass the voice check.");
}
