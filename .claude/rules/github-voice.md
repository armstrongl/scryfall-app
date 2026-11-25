# GitHub voice

These rules cover every text an agent writes for this project: commits, pull request titles and descriptions, issues, comments, reviews, release notes, code comments, docs, help pages, and interface copy. They override any global instruction to write in the first person.

## Person

- Never use the first person: no "I", "my", "me", "myself", "we", "our", or "us".
- Never use the third person or a role for the person the app is built for: no name, "she", "her", "the owner", "the developer", or "the user" when it means that person. "The user" is fine for anyone who uses the app.
- Write impersonally. Use the imperative ("Add Explore icons"), the change as the subject ("This change adds Explore icons"), or the passive where the actor doesn't matter ("Requested on 7 November").
- Never put words in anyone's mouth. Don't say that something was tested, reviewed, seen, liked, or decided by a person unless it was. Say what the change does and what the checks show: "The browser tests pass at 390 px and 1280 px", not "Checked on an iPhone."

## Nothing about agents or sessions

- No links to a Claude Code session on claude.ai, no session trailers (lines that start with `Claude-Session`), and no session IDs, anywhere.
- No `Co-Authored-By` lines, "Generated with" footers, agent labels, or other signs that an agent wrote the text.
- No emoji in commits, pull requests, issues, or comments.

`.claude/settings.json` turns off Claude Code's attribution, and a Claude Code hook in `.claude/hooks/` blocks a commit, pull request, issue, or comment that breaks these rules. Other agents must keep the rules by hand. `.githooks/commit-msg` removes session links from commit messages for any agent that installs it (`AGENTS.md` has the command).

## Commits

- The subject is short, imperative, and in sentence case, with no prefix and no full stop: "Link to combos on Commander Spellbook". Don't use Conventional Commits prefixes.
- The body says what changed and why. Use bullets when there are several changes.

## Pull requests and issues

- Write the description and issue bodies in [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/): short sentences, one instruction per sentence, the active voice, and approved words. In Claude Code, the `ste-simplify` skill helps where it's installed.
- A pull request description has these parts:
  - What changed.
  - Why.
  - Decisions made where the docs were silent.
  - Which tests were written first, and which were added after the code (and how each one was proved able to fail).
  - Anything left open, as a link to a GitHub issue.
- Merge with a merge commit, not a squash or rebase.

## Links

Link out freely: to card pages on [Scryfall](https://scryfall.com), API docs, help pages, other apps and sites, issues, pull requests, and files in the repository. A reader should never have to search for a thing that a link could have shown them.

## Style

- Write plainly, like a friendly technical writer. Use sentence case for headings and titles.
- Don't use "just", "simply", "obviously", "leverage", or marketing language.

The voice tests skip text in quotes, so that a rule can name the words it bans. Check quoted text yourself.

The `pr-text` check on GitHub (`scripts/check-pr-text.mjs`) applies the same rules to the pull request title, the description, and each commit message that the pull request adds. It uses the word lists in `scripts/voice.mjs`, the same lists as the voice tests. It skips quoted text, code spans, URLs, and fenced code for the person checks. Session links fail anywhere, even in quotes or code. Co-author trailers and "Generated with" footers fail at the start of a line, so prose can name them. Merge commits get only the session and attribution checks.

## Fixing old text

When you find first-person, third-person, or session text in a file or in a pull request that is already merged, fix it as part of your change: edit the file, or edit the pull request title and description with `gh pr edit`. Rewrite git history only to remove a session link or trailer, or to reword a commit on a pull request branch that is not merged yet, when the `pr-text` check fails on it. That needs a force push (`git push --force-with-lease`), which `.claude/settings.json` sets to ask first. The setting matches `git push --force` and `git push -f` only. It doesn't catch `git push origin +main` or `git -C <path> push --force`, so never use those forms. In Claude Code, a hook asks before those forms too.

## Outside this repository

Don't comment on, open, react to, or review issues and pull requests in any other repository unless the session asks for it or approves it first. Without approval, write the item up as an issue here instead.
