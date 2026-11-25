---
paths:
  - "src/ui/**"
  - "src/main.js"
---

# UI behavior

How controls behave after a press: how many times an action runs, where focus goes, and what state a view reads. Opus reviews found the same kinds of bugs again and again, so each rule names the pattern the code already uses. [Design](design.md) covers the look, labels, tooltips, and `announce()`. `AGENTS.md` covers `h()` and `confirmBox()`.

## One press, one action

- Turn a control off from the first press until its save ends. A quick double press of **Duplicate** made two copies ([pull request #58](https://github.com/armstrongl/scryfall-app/pull/58), [issue #46](https://github.com/armstrongl/scryfall-app/issues/46)), and of **Save list** two lists ([pull request #64](https://github.com/armstrongl/scryfall-app/pull/64), [issue #14](https://github.com/armstrongl/scryfall-app/issues/14)). Patterns: `duplicateBtn.disabled` in `src/ui/lists-view.js`, a `busy` flag with `setBusy()` in `src/ui/import-panel.js`, and the disabled buttons in `confirmBox()`.
- Run edits to one record one at a time, so a second press reads the saved copy. Pattern: the `run()` queue in `createDeckMode()` in `src/ui/deck-bar.js` ([pull request #56](https://github.com/armstrongl/scryfall-app/pull/56)).
- Share a request that is already on its way. A rulings request could be sent twice (the second review of the design overhaul, [pull request #1](https://github.com/armstrongl/scryfall-app/pull/1)). Pattern: the `rulingsLoading` map in `src/ui/details.js`.

## Focus after an action

- When a view draws again, put focus back on the same control. Find rows by ID, not by position, because a sort moves rows (a known problem of v1, fixed in [pull request #1](https://github.com/armstrongl/scryfall-app/pull/1)). Patterns: `describe()` and `restore()` in `src/ui/lists-view.js`, and `focusNext` with element IDs in `src/ui/data-view.js`.
- When a list of boxes is drawn again, move focus to the new box for the same item. Ticking a set from the keyboard lost focus ([pull request #38](https://github.com/armstrongl/scryfall-app/pull/38)). Pattern: `toggleSet()` in `src/ui/criteria-form.js`.
- To block a focused button for a time, use `aria-disabled="true"` and an early return, not `disabled`. A disabled button drops focus: **Sync now** lost it during a sync ([pull request #32](https://github.com/armstrongl/scryfall-app/pull/32)). Same pattern: **Export to GitHub** in `src/ui/data-view.js`, and **+** at the copy limit, which also announces the limit ([pull request #56](https://github.com/armstrongl/scryfall-app/pull/56)).
- When the pressed button turns off, move focus to the next useful control. **New hand** gets focus when the library runs out, and **Draw a card** after the last **Put on bottom** ([pull request #63](https://github.com/armstrongl/scryfall-app/pull/63), [issue #24](https://github.com/armstrongl/scryfall-app/issues/24)). Pattern: the `(mulliganBtn.disabled ? newBtn : mulliganBtn).focus()` fallback in `src/ui/lists-view.js`.
- After an error, focus the control that can try again. A read error from GitHub lost focus ([pull request #36](https://github.com/armstrongl/scryfall-app/pull/36)). Patterns: `githubReadError()` and `syncError(text, focusEl)` in `src/ui/data-view.js`.
- A disabled button can't show its tooltip, so say why in the page. An empty deck's **Sample hand** panel says to add cards ([pull request #63](https://github.com/armstrongl/scryfall-app/pull/63)).

## Stale state

- A tooltip must never outlive its control. A tooltip stayed open over new cards, and open tooltips removed by a re-render swallowed Escape ([pull request #12](https://github.com/armstrongl/scryfall-app/pull/12)). Pattern: `wireTip()` in `src/ui/dom.js` hides a button's tooltip on click and drops tooltips that are no longer on the page before it takes Escape.
- When a mode ends on its own, undo everything it changed. Deck mode stopped when its deck was deleted or made a collection, and hidden cards stayed hidden ([pull request #56](https://github.com/armstrongl/scryfall-app/pull/56)). Pattern: `refresh()` in `src/ui/deck-bar.js` calls `hooks.onStop()`, and `app.checkDeckMode()` in `src/main.js` runs on every reload.
- Clear an **Undo** when its record changes any other way, and check the rules again before it restores. **Undo** could restore a copy past the limit ([pull request #56](https://github.com/armstrongl/scryfall-app/pull/56)). Pattern: `undo.updatedAt` and `canAddCopy()` in `undoRemove()`.
- Read the record from `app` just before an edit, never from a copy kept since the last draw. Views must never edit a copy older than storage ([GitHub sync](github-sync.md)). Pattern: look the list up in `app.lists` by ID at the time of the edit, as `src/ui/lists-view.js` does, and `app.reload()` from `onLocalChange` in `src/main.js`.
- A panel that is kept across re-renders starts fresh when it opens again. A reopened **Import deck** panel kept the last list chosen with the format reset, so a second import could change a Brawl deck to Standard ([pull request #64](https://github.com/armstrongl/scryfall-app/pull/64)). Pattern: `reset()` on **Cancel** and after a save, and `refreshTargets()` on open, in `src/ui/import-panel.js`.
- Results belong to the input that made them. Changing the deck text clears the lookup, and the text is read-only while a lookup runs ([pull request #64](https://github.com/armstrongl/scryfall-app/pull/64)).
- A late reply must not replace a newer one. Patterns: `AbortController` for draws and Browse loads in `src/ui/discover.js` ([pull request #1](https://github.com/armstrongl/scryfall-app/pull/1)), and `readSeq` in `src/ui/data-view.js`, which also drops a GitHub backup list when the connection changes ([pull request #36](https://github.com/armstrongl/scryfall-app/pull/36)).

## Labels and IDs

- A label points at the ID its control has now. The **Can be your commander** label pointed to an old ID ([pull request #52](https://github.com/armstrongl/scryfall-app/pull/52)). Patterns: `checkbox()` uses the `id` it gets, and `field()` uses `control.id`, both in `src/ui/dom.js`. A browser check tests every checkbox label.

## Panels and the primary button

- An open panel takes the view's one primary button, and the view's own primary turns secondary until it closes. The open **Import deck** panel made a second primary button ([pull request #64](https://github.com/armstrongl/scryfall-app/pull/64)). Pattern: **Make list** in `src/ui/lists-view.js`. [Design](design.md) has the one-primary rule.
