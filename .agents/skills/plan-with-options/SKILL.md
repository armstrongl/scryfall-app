---
name: plan-with-options
description: Bring a Cascade plan, or several open questions, as a page with inputs. Use before a large change, a redesign, or any decision with more than one question. For a single quick choice, ask one question in the session instead.
---

# Plan with options

A plan or a set of decisions goes on a page that can be read and answered in one place, not in a long message.

## What the page has

1. **A summary**: what the plan does and why, in a few sentences.
2. **What was found**: the facts behind the plan, each with its source (a file, a session request, a doc link).
3. **The proposal**: each part as its own item.
4. **Feedback on every item**: **Keep**, **Change**, or **Drop**, with a note.
5. **Questions**: each with two to four options, the recommended one first and marked, a reason for each, and a notes box.
6. **Free-text boxes** for anything missed.
7. **What happens next.**

## How to build it

- Answers save as they are given, so they can be read back without a paste. Also give a **Copy answers** button that makes plain text, as a fallback.
- Use Cascade's look: the neutral tokens from `styles.css`, the system font, 6px corners, and 1px borders. Light and dark mode.
- Follow [GitHub voice](../../../.claude/rules/github-voice.md): no first person, and no third person for the person the app is built for. Address the reader as "you".
- Keep the source file in `.artifacts/` (gitignored), and publish from there. Republish the same file to keep the same link.

In Claude Code, publish the page as a claude.ai artifact with the Artifact tool and the `db` capability, then read the answers with the ArtifactData tool. Other agents can write the same page as a local HTML file in `.artifacts/` and ask for the copied answers.

## After the answers

- Apply every **Keep**, **Change**, and **Drop**. When a note conflicts with an existing rule, or its scope is unclear, ask one quick question before you build.
- Record each new request or taste in the rules file it belongs to.
- Then follow the [ship](../ship/SKILL.md) skill.
