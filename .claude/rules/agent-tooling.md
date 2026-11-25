---
paths:
  - ".claude/hooks/**"
  - ".githooks/**"
  - ".github/**"
  - ".claude/settings.json"
  - "scripts/check-changelog.mjs"
  - "scripts/check-pr-text.mjs"
  - "scripts/voice.mjs"
  - "tests/agent-docs.test.js"
  - "tests/hooks.test.js"
  - "tests/check-pr-text.test.js"
  - "tests/check-changelog.test.js"
---

# Agent tooling

The hooks, GitHub checks, and tests that enforce the agent rules. [GitHub voice](github-voice.md) and [Shipping](shipping.md) say what the rules are. This file says how the tooling is built and how to change it without opening a gap. [Pull request #34](https://github.com/armstrongl/scryfall-app/pull/34) added the checks, [pull request #55](https://github.com/armstrongl/scryfall-app/pull/55) the text check, and [pull request #62](https://github.com/armstrongl/scryfall-app/pull/62) the hooks for [issue #9](https://github.com/armstrongl/scryfall-app/issues/9).

## One source for the word lists

- `scripts/voice.mjs` holds the voice lists and `voiceProblems()`. `tests/agent-docs.test.js`, `tests/docs.test.js`, `scripts/check-pr-text.mjs`, and `.claude/hooks/pre-tool-use.mjs` import it, so a text the hook lets through also passes `pr-text` ([#55](https://github.com/armstrongl/scryfall-app/pull/55), [#62](https://github.com/armstrongl/scryfall-app/pull/62)). Keep it plain ESM with no DOM and no dependencies, so any script or hook can import it.
- Change a list only there. Don't add a local exception in a test, the hook, or the check. False matches such as "developer tools" and "repository owner" belong in [issue #61](https://github.com/armstrongl/scryfall-app/issues/61).
- Build the session pattern from parts in any file that names it, as `scripts/voice.mjs`, `.githooks/commit-msg`, and `tests/hooks.test.js` do, so the file doesn't fail its own check.

## How a check is built

- Put the logic in an exported pure function with unit tests: `changelogProblems()` and `prTextProblems()`.
- Keep the command-line part thin. It runs only as the main script, reads env vars (`PR_NUMBER`, `PR_LABELS`, `PR_TITLE`, `PR_BODY`), prints each problem, and exits 1 on a problem and 2 on missing input.
- Test that part in a temporary repository whose HEAD is a merge commit, like the one GitHub checks out: `HEAD^1` is main and `HEAD^2` is the branch.
- `changelog` diffs the merge commit against its first parent, because the base commit in the event data can be older than main ([#34](https://github.com/armstrongl/scryfall-app/pull/34)).
- `pr-text` reads only `HEAD^1..HEAD^2`, the commits the pull request adds. Old commits on main don't count, and merge commits get only the session and attribution checks, because git writes the rest of their messages ([#55](https://github.com/armstrongl/scryfall-app/pull/55)).

## Workflows

- Pass event data through `env:`. Never put `${{ }}` inside `run:`. `tests/check-changelog.test.js` fails when an expression sits anywhere but an `env` line or the `concurrency` group ([#34](https://github.com/armstrongl/scryfall-app/pull/34)).
- A new job gets a test that the workflow runs it, like the workflow tests in `tests/check-changelog.test.js` and `tests/check-pr-text.test.js`.
- Add a new job to the list in [issue #35](https://github.com/armstrongl/scryfall-app/issues/35), and to `AGENTS.md`, so it is made required with the others.

## Claude Code hooks

- `.claude/settings.json` registers `pre-tool-use.mjs` for Bash, the GitHub MCP tools, and Edit, MultiEdit, and Write, and `stop.mjs` for Stop. `tests/agent-docs.test.js` checks each matcher, that each script exists, and that each timeout is 30 seconds or less.
- A hook denies or asks, and never allows. The test fails when a hook file holds a quoted "allow". An error or unreadable input gives no decision, so a broken hook never blocks work ([#62](https://github.com/armstrongl/scryfall-app/pull/62)).
- Permission rules match text, so they aren't a boundary: `Bash(git push --force*)` misses `git -C . push --force`. The hook parses the command with `.claude/hooks/shell.mjs` instead.
- Keep the parser finding commands inside `if`, loops, `{ }`, `bash -c`, substitutions, and pipes, past wrappers such as `env -u`, with text from heredocs and body files. Resolve `gh api` paths with repository placeholders, and honor `--repo` and `GH_REPO`. The review of [#62](https://github.com/armstrongl/scryfall-app/pull/62) found each gap, and each has a test.
- Find the main script with `realpathSync`, so a hook started through a symlinked path still runs.
- Other repositories get only the session and attribution checks. The Stop hook reminds once for each set of changes through `additionalContext`, and never blocks.
- To test a hook, write the failing sample first. `tests/hooks.test.js` starts each hook with `node`, writes real hook input as JSON on stdin, and checks the decision it prints (`node --test tests/hooks.test.js`). Keep a sample of normal work that must get no decision.

## Git hooks and test repositories

- `.githooks/commit-msg` removes session references for any agent. Don't install it with `core.hooksPath`: that turns off the other hooks in `.git/hooks`. `AGENTS.md` has the copy command ([#62](https://github.com/armstrongl/scryfall-app/pull/62)).
- Test repositories turn off git hooks (`-c core.hooksPath=/dev/null`) and commit signing (`-c commit.gpgsign=false`). A global commit-msg hook removed a test trailer ([#55](https://github.com/armstrongl/scryfall-app/pull/55)), and a global signing setting made tests hang ([#38](https://github.com/armstrongl/scryfall-app/pull/38)).

## The agent docs test

- `tests/agent-docs.test.js` caps `AGENTS.md` at 200 lines and checks that `CLAUDE.md` starts with `@AGENTS.md`, that each rule in `RULES` exists, is linked from `AGENTS.md`, and has exactly the listed `paths`, that each path matches a file, that relative links resolve, and that no file has a session link or the first person. A new rule file needs an entry in `RULES` and a row in the `AGENTS.md` table.
