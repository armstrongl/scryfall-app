@AGENTS.md

## Claude Code notes

These notes add to `AGENTS.md`. They cover only what is specific to Claude Code.

- **Rules load by themselves.** The files in `.claude/rules/` without `paths` load at the start of every session. The others load when you read or edit a matching file. Run `/context all` and look under **Memory files** to see which ones loaded.
- **Skills.** `.claude/skills` links to `.agents/skills/`, so `/ship` and `/plan-with-options` work here. The same skills load in Codex from `.agents/skills/`.
- **Settings.** `.claude/settings.json` turns off commit and pull request attribution and session links, and asks before any force push. Personal settings go in `.claude/settings.local.json`, which git ignores.
- **Reviews and second opinions.** Use the Agent tool with `model: "opus"`.
- **Questions.** Use AskUserQuestion for one quick choice. For a plan or several questions, publish a page with the Artifact tool and the `db` capability, and read the answers back with ArtifactData. The [plan-with-options](.agents/skills/plan-with-options/SKILL.md) skill has the details.
- **Worktrees.** Superset runs several agents at once, each in its own worktree under `~/worktrees/`. Don't edit the main checkout at `~/Projects/scryfall-app` while another agent may be using it.
