---
name: issue-sweep
description: Work through the open Cascade issues with parallel agents, one issue per agent, each in its own worktree, each shipping its own merged pull request. Use when a session asks to work on the open issues, to clear the backlog, or to fan out agents across issues.
---

# Sweep the open issues

One coordinator picks a batch of issues and starts one agent per issue. Each agent takes its issue from the first fetch to a merged pull request with the [ship](../ship/SKILL.md) routine. The coordinator doesn't write code for the issues. It keeps the agents in step, checks each result on GitHub, and opens the app once at the end.

## 1. Survey

- `gh issue list --state open --limit 100` and read each body: `gh issue view <n>`.
- Find work in progress, so that two agents don't build the same thing: `gh pr list --state open`, `git worktree list`, `git branch -a --sort=-committerdate`, and the `.artifacts/` folder of each worktree. In Claude Code, `ListAgents` shows the other sessions on this computer. Ask each session which issues it has.
- Check that `main` is up to date: `git fetch origin`.

## 2. Pick a batch

Skip an issue when:

- It needs a question first ("Ask only about" in `AGENTS.md`): IndexedDB schema or backup format changes, removing or changing a requested feature, taste and feel, or an action on GitHub outside this repository.
- It is a repository setting, or it needs a real token or account.
- It depends on an issue that isn't merged yet, or another session owns it.

Take at most five issues at a time. Prefer issues that touch different files. Some conflicts can't be avoided: `CHANGELOG.md`, `docs/ui-copy.md`, `src/docs.js`, `README.md`, `AGENTS.md`, and `scripts/check-ui.mjs` change in almost every pull request. Each agent resolves them when it rebases.

## 3. Start the agents

In Claude Code, use the Agent tool once per issue, all in one message, with `model: "opus"`. The agents run in the background. Each agent makes its own worktree (`~/worktrees/scryfall-app-<name>`), as [shipping](../../../.claude/rules/shipping.md) says. Give every agent the same brief, with its own issue, branch, and the list of the other agents' issues:

> Take issue #N from start to a merged pull request, on your own. Read `AGENTS.md`, `.claude/rules/shipping.md`, `.claude/rules/github-voice.md`, `.agents/skills/ship/SKILL.md`, and the rules files for the files you touch, then `gh issue view N`.
>
> - Make your worktree: `git -C ~/Projects/scryfall-app fetch origin && git -C ~/Projects/scryfall-app worktree add ~/worktrees/scryfall-app-<name> -b <name> origin/main`. Don't edit the main checkout.
> - Other agents are working at the same time on issues A, B, and C. Don't build their features.
> - When you rebase, keep both sides of a conflict. Rebuild `docs/ui-copy.md` with `node scripts/ui-copy.mjs`. Add the changelog entry under the heading for the merge date if one exists.
> - Run every command that sends Scryfall requests through the lock: `scripts/scryfall-lock.sh node scripts/check-ui.mjs`. Do the same for `check-api.mjs` and `fetch-fixtures.sh`. The lock can wait a long time for other runs, so run the command in the background (in Claude Code, the Bash tool's `run_in_background`). A foreground timeout kills the run.
> - If the issue needs a question from "Ask only about" in `AGENTS.md`, don't ship that part. Report the question.
> - Work test first. Get an Opus review of the diff. Ship with the ship skill.
> - Put "Closes #N." in the description. Before you merge, check that `gh pr view --json closingIssuesReferences` lists only #N. After the merge, check that `gh issue view N --json state` is closed. Close the issue by hand if it isn't.
> - Remove your worktree and branch when the pull request is merged. Don't open the app: the coordinator does that once.
> - Final report, under 200 words: the pull request link and state, what shipped, decisions made, which tests came first and which after, anything left open (as issue links), and any question that needs an answer. Say so if commits went out unsigned.

## 4. Keep the agents in step

- When `main` gets a change that affects every agent, such as a new GitHub check or a renamed term in the agent docs, send each agent a short note (`SendMessage` in Claude Code): what changed, and what to do about it (rebase, wait for a new check, keep a new word).
- Answer other sessions that ask which issues the sweep has. Tell them about `scripts/scryfall-lock.sh`.
- While an agent is busy, don't do its work. If one runs much longer than the others, check its pull request and its processes (`gh pr list --head <branch>`, `ps aux | grep check-ui`) before you step in.

## 5. Check each result

An agent's report is a claim. Check it on GitHub before you pass it on:

- `gh pr view <pr> --json state,mergedAt,closingIssuesReferences`: merged, and the closing list names only its own issue. Remove a stray "Closes" line with `gh pr edit --body-file`. A stray line closes its issue when the pull request merges, so open that issue again with `gh issue reopen <n>` unless it was already closed for another reason.
- `gh issue view <n> --json state`: closed. Check each follow-up issue the agent named too.
- `gh api repos/armstrongl/scryfall-app/pulls/<pr>/commits --jq '.[].commit.verification.verified'`: say which commits are unsigned.

## 6. Finish

When every agent has reported, open the merged app once, as "Finish" in [shipping](../../../.claude/rules/shipping.md) says. Then report in one table: each issue, its pull request, and where to look in the app. After the table, list what needs a person, the new follow-up issues, and anything that went wrong, such as a check that failed only once or an issue that had to be closed by hand.
