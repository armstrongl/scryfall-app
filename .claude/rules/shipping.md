# Shipping

This is the routine for every change, from start to finish. The [ship skill](../../.agents/skills/ship/SKILL.md) has the same steps as a checklist.

## Start

1. Other agents may be working at the same time, each in its own worktree. Fetch first: `git fetch origin`.
2. Make a branch from `origin/main` in your own worktree. Name the branch for the change, such as `explore-icons`. In a Superset workspace, the workspace already is the worktree. Name the workspace with `superset ws update`.
3. For a large change or one with open questions, plan first. Bring the plan as a page with inputs ([plan-with-options](../../.agents/skills/plan-with-options/SKILL.md)). For one quick choice, ask one question in the session.

## Build

1. Write the test first and watch it fail for the expected reason. `AGENTS.md` says where each kind of test goes.
2. Write the smallest code that passes, then refactor with the tests green.
3. Run `npm test` and `node scripts/check-ui.mjs`. Both must pass.
4. Check every place in "Keep the docs in step" in `AGENTS.md`.

## Review

1. Ask an Opus subagent to review the change. In Claude Code, use the Agent tool with `model: "opus"`. Give it the diff and `AGENTS.md`, not your own conclusions, so that its read is independent.
2. Fix what it finds, or say in the pull request why you didn't.

## Ship

1. Fetch again and rebase on `origin/main`. Run the tests again if anything came in.
2. Push the branch and open a pull request. [GitHub voice](github-voice.md) says how to write it.
3. Merge it yourself with a merge commit when the checks pass: `gh pr merge --merge --delete-branch`.
4. Delete the branch locally and on GitHub, and update the local `main`.
5. Put any work you deferred into a GitHub issue, with its plan, and link it from the pull request.

## Finish

1. After every change, start the app (`python3 -m http.server 8000` from the up-to-date `main`) and open <http://localhost:8000/> in the default browser (`open http://localhost:8000/` on macOS). Say what changed and where to look.
2. Fix open items yourself. Never leave a command for someone else to run when you can run it. If something truly needs a person, such as a repository setting, say exactly what it is and why.
3. Report in plain words. Say what a git state means for the reader ("your copy is missing one change from GitHub"), not the jargon for it.
