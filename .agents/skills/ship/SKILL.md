---
name: ship
description: Take a Cascade change from start to merged, test first. Use for every code, docs, or instruction change in this repository, from the first fetch to the app open in the browser.
---

# Ship a change

This is the checklist form of [shipping](../../../.claude/rules/shipping.md). Read [AGENTS.md](../../../AGENTS.md) and [GitHub voice](../../../.claude/rules/github-voice.md) first.

## Checklist

1. **Fetch.** `git fetch origin`. Other agents may have merged work.
2. **Branch.** Make a worktree and branch from `origin/main`:
   `git worktree add ../scryfall-app-<name> -b <name> origin/main`.
   In a Superset workspace, use the workspace and name it with `superset ws update`.
3. **Plan.** For a large change or open questions, use the [plan-with-options](../plan-with-options/SKILL.md) skill. For one choice, ask one question.
4. **Test first.** Write the test. Run it. See it fail for the expected reason.
5. **Build.** Write the smallest code that passes. Refactor with the tests green.
6. **Check.** `npm test` and `node scripts/check-ui.mjs` both pass.
7. **Docs.** Go through "Keep the docs in step" in `AGENTS.md`. Update each place the change affects.
8. **Review.** Ask an Opus subagent for a review. Give it the diff and `AGENTS.md`, not your conclusions. Fix what it finds, or record why not.
9. **Rebase.** `git fetch origin && git rebase origin/main`. Run the tests again if anything came in.
10. **Commit.** Use an imperative, sentence-case subject with no prefix, and a body that says what and why. No first person, no session links, no attribution.
11. **Pull request.** `gh pr create`. Write the description in ASD-STE100 Simplified Technical English: what changed, why, decisions, tests first and after, and open items as issue links.
12. **Merge.** `gh pr merge --merge --delete-branch`. Delete the local branch and worktree. Update the local `main`.
13. **Defer.** Put deferred work in a GitHub issue with its plan, and link it from the pull request.
14. **Open the app.** From the up-to-date `main`, run `python3 -m http.server 8000`, then `open http://localhost:8000/`. Say what changed and where to look.
15. **Report.** Use plain words. Fix open items yourself. Name anything that truly needs a person, and why.
