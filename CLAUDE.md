@AGENTS.md

## Claude Code notes

These notes add to `AGENTS.md`. They cover only what is specific to Claude Code.

- **Rules load by themselves.** The files in `.claude/rules/` without `paths` load at the start of every session. The others load when you read or edit a matching file. Run `/context all` and look under **Memory files** to see which ones loaded.
- **Skills.** `.claude/skills` links to `.agents/skills/`, so `/ship` and `/plan-with-options` work here. The same skills load in Codex from `.agents/skills/`.
- **Settings.** `.claude/settings.json` turns off commit and pull request attribution and session links, and asks before any force push. Personal settings go in `.claude/settings.local.json`, which git ignores.
- **Hooks.** `.claude/settings.json` registers the scripts in `.claude/hooks/`. They need only Node.js, and an error in a script never blocks a tool call. `tests/hooks.test.js` tests each one.
  - `pre-tool-use.mjs` runs before `Bash`, the GitHub MCP tools, and `Edit` or `Write`. It blocks a commit message, a pull request, issue, or release title or body, or a comment with a session link, trailer, or ID, a `Co-Authored-By` line, a "Generated with" footer, or words that break [GitHub voice](.claude/rules/github-voice.md). It uses the word lists in `scripts/voice.mjs`, the same as the `pr-text` check on GitHub. It reads `-m`, `-F`, heredocs, `--body-file`, `gh api` fields, and commands inside `if`, loops, pipes, substitutions, and `bash -c`. For another repository it checks only sessions and attribution. It asks before a force push in any form, such as `git -C . push --force` or `git push origin +main`. It blocks an edit that brings `api.scryfall.com` or `API_BASE` into a module other than `src/scryfall.js`.
  - `stop.mjs` runs when Claude stops. When files changed since the last commit, it reminds once to run `npm test`. It doesn't block.
  - A hook can deny or ask. It never allows a tool call, so it can't loosen the permission rules.
  - To quote a banned word, put it in "double quotes" or a code span.
- **Reviews and second opinions.** Use the Agent tool with `model: "opus"`.
- **Questions.** Use AskUserQuestion for one quick choice. For a plan or several questions, publish a page with the Artifact tool and the `db` capability, and read the answers back with ArtifactData. The [plan-with-options](.agents/skills/plan-with-options/SKILL.md) skill has the details.
- **Worktrees.** Paradev (formerly Superset) runs several agents at once, each in its own worktree under `~/worktrees/`. Don't edit the main checkout at `~/Projects/scryfall-app` while another agent may be using it.
