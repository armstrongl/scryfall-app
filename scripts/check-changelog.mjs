// The changelog check for a pull request, run by .github/workflows/check.yml.
// It fails unless the pull request changes CHANGELOG.md and links to itself
// there, or has the no-changelog label.
//
// Environment: PR_NUMBER, and PR_LABELS (a JSON array of label names). Run
// it from the repository root, with HEAD at the merge commit that GitHub
// checks out for a pull request: its first parent is main, so the diff
// against HEAD^1 holds exactly the files the pull request changes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SKIP_LABEL = "no-changelog";
const PR_URL = "https://github.com/armstrongl/scryfall-app/pull";

/**
 * The reasons a pull request fails the check, or none.
 * @param {{number: number, labels: string[], changedFiles: string[], changelog: string}} pr
 * @returns {string[]}
 */
export function changelogProblems({ number, labels, changedFiles, changelog }) {
  if (labels.includes(SKIP_LABEL)) return [];
  const problems = [];
  if (!changedFiles.includes("CHANGELOG.md")) {
    problems.push(`This pull request doesn't change CHANGELOG.md. Add an entry, or add the ${SKIP_LABEL} label.`);
  }
  // The closing parenthesis keeps #4 from matching a link to #40.
  if (!changelog.includes(`${PR_URL}/${number})`)) {
    problems.push(`CHANGELOG.md has no link to this pull request: (${PR_URL}/${number}).`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const number = Number(process.env.PR_NUMBER);
  if (!number) {
    console.error("Set PR_NUMBER.");
    process.exit(2);
  }
  const changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const problems = changelogProblems({
    number,
    labels: JSON.parse(process.env.PR_LABELS || "[]"),
    changedFiles,
    changelog: readFileSync("CHANGELOG.md", "utf8"),
  });
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("The changelog has an entry for this pull request.");
}
