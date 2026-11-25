# Shipping

This is the routine for every change, from start to finish. The [ship skill](../../.agents/skills/ship/SKILL.md) has the same steps as a checklist.

## Start

1. Other agents may be working at the same time, each in its own worktree. Fetch first: `git fetch origin`. If the clone has no `commit-msg` hook, install the copy in `.githooks/` (`AGENTS.md` has the command).
2. Make a branch from `origin/main` in your own worktree under `~/worktrees/`: `git worktree add ~/worktrees/scryfall-app-<name> -b <name> origin/main`. Name the branch for the issue or the change, such as `explore-icons`, so that other agents can see who has it. In a Paradev (formerly Superset) workspace, the workspace already is the worktree. Name the workspace with `paradev ws update "$SUPERSET_WORKSPACE_ID" --name <name>`.
3. Don't edit the main checkout at `~/Projects/scryfall-app`. Another agent may be using it.
4. For a large change or one with open questions, plan first. Bring the plan as a page with inputs ([plan-with-options](../../.agents/skills/plan-with-options/SKILL.md)). For one quick choice, ask one question in the session.

## Work beside other agents

- These rules apply whenever other agents may be working at the same time. Assume they are unless `git worktree list` shows only your worktree and the main checkout.
- Before you start, look for other agents: `git worktree list`, the open pull requests (`gh pr list`), and in Claude Code the sessions that ListAgents shows. Don't take an issue that another worktree or session already has. When two sessions overlap, agree on a split by message. The [issue-sweep skill](../../.agents/skills/issue-sweep/SKILL.md) has the full survey for a batch of issues.
- Run `scripts/check-ui.mjs`, `scripts/check-api.mjs`, and `scripts/fetch-fixtures.sh` through the lock, so that only one agent at a time sends Scryfall requests: `scripts/scryfall-lock.sh node scripts/check-ui.mjs`. It waits while another run holds the lock, which can take a long time, so run it in the background: a foreground timeout kills the run.
- Expect rebase conflicts in the shared docs: `AGENTS.md`, `CLAUDE.md`, this file, `CHANGELOG.md`, and `README.md`. Keep the changes from both sides.
- When `CHANGELOG.md` already has a heading for the date, add to it ([Ship](#ship), step 3).
- Remove a worktree only when it is yours, or when it has no uncommitted changes and its branch is merged.

## Build

1. Write the test first and watch it fail for the expected reason. `AGENTS.md` says where each kind of test goes.
2. Write the smallest code that passes, then refactor with the tests green.
3. Run `npm test` and `node scripts/check-ui.mjs`. Both must pass. When other agents work at the same time, run the browser tests through the lock, as [Work beside other agents](#work-beside-other-agents) says.
4. Check every place in "Keep the docs in step" in `AGENTS.md`.

## Review

1. Ask an Opus subagent to review the change. In Claude Code, use the Agent tool with `model: "opus"`. Give it the diff and `AGENTS.md`, not your own conclusions, so that its read is independent.
2. Fix what it finds, or say in the pull request why you didn't.

## Ship

1. Fetch again and rebase on `origin/main`. Run the tests again if anything came in.
2. Push the branch and open a pull request. [GitHub voice](github-voice.md) says how to write it.
3. Add the entry to `CHANGELOG.md`, linked to the new pull request, then commit and push it. Use the date it merges, in local time. If that date already has a heading, for example from another agent's change, add to it. Write for someone using the app, and put changes to tests, scripts, and agent instructions under **Project**. Before you merge, check the link is there: `grep -q "pull/$(gh pr view --json number -q .number))" CHANGELOG.md`.
4. Merge it yourself with a merge commit when the checks pass: `gh pr merge --merge --delete-branch`. GitHub runs three checks, from `.github/workflows/check.yml`, and all three must pass: `test` runs `npm test`, `changelog` needs a `CHANGELOG.md` entry linked to the pull request, and `pr-text` checks the title, the description, and each commit message of the pull request against [GitHub voice](github-voice.md). To fix a failed `pr-text` check, edit the title or description with `gh pr edit`, which runs the checks again, or reword the commit (`git rebase -i`) and push with `git push --force-with-lease`, which asks first. [GitHub voice](github-voice.md) allows that rewrite for a branch that is not merged yet. Wait for them: `until gh pr checks | grep -q changelog; do sleep 5; done; gh pr checks --watch`. The loop waits for the run of the newest push to appear. If the checks never start, the branch probably conflicts with `main`: rebase on `origin/main` and push. The `changelog` check fails until the entry is pushed. That is expected. Only a change with nothing to record, such as a typo fix in a rule file, gets the `no-changelog` label instead of an entry: `gh pr edit --add-label no-changelog`. Never use `gh pr merge --admin` to get past a failed check.
5. Delete the branch locally and on GitHub, and remove your worktree when you're done with it. If the main checkout has no uncommitted changes, update it with `git -C ~/Projects/scryfall-app pull --ff-only`. If it has changes, leave it alone.
6. Put any work you deferred into a GitHub issue, with its plan, and link it from the pull request.

## Finish

1. After every change, open the merged app. In your worktree, run `git fetch origin && git switch --detach origin/main`, then `python3 -m http.server 8000`. If port 8000 is taken, use the next free port. Open it in the default browser (`open http://localhost:8000/` on macOS). Say what changed and where to look.
2. Fix open items yourself. Never leave a command for someone else to run when you can run it. If something truly needs a person, such as a repository setting, say exactly what it is and why.
3. Report in plain words. Say what a git state means for the reader ("your copy is missing one change from GitHub"), not the jargon for it.
