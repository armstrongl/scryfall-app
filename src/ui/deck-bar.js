// Deck mode in Discover: the Deck menu, the deck bar, and the count with
// − and + in each card's caption. The rules are in src/deck-mode.js. The
// chosen deck is kept on this device only (getDeckMode() in
// src/storage/index.js).

import { DECK_FORMAT_NAMES, SECTION_NAMES } from "../config.js";
import { cardKey } from "../cards.js";
import { addCopy, addSections, canAddCopy, copyRule, deckCounts, deckSummary, isInDeck, removeCopy } from "../deck-mode.js";
import { restoreEntry } from "../lists.js";
import { TIPS } from "../docs.js";
import { announce, field, h, plural, replace, withTip } from "./dom.js";

/**
 * @param {import("../main.js").App} app
 * @param {{onStart: (list: import("../lists.js").CardList) => void, onHideChange: () => void, onStop: () => void}} hooks
 *   onStart sets the starting filters. onHideChange and onStop show or hide cards again.
 */
export function createDeckMode(app, hooks) {
  /** Every card's controls that may be on the page. */
  const steppers = new Set();
  /** The entry removed by the last −, shown as Undo in that card's controls. */
  let undo = null;
  /** Edits run one at a time, so a quick second press reads the saved deck. */
  let queue = Promise.resolve();
  const run = (fn) => { queue = queue.then(fn, fn); return queue; };

  const sectionName = (s) => SECTION_NAMES[s] ?? s;
  const formatName = (list) => DECK_FORMAT_NAMES[list.format] ?? "Standard";

  // The Deck menu ------------------------------------------------------------------
  const select = h("select", { id: "deck-select", onchange: () => (select.value ? start(select.value, { focus: false }) : stop({ focus: false })) });
  const menu = field("Deck", select, undefined, TIPS.deckMode);
  menu.classList.add("deck-menu");

  function renderMenu() {
    const decks = app.lists.filter((l) => l.kind === "deck").sort((a, b) => a.name.localeCompare(b.name));
    replace(select,
      h("option", { value: "", text: decks.length ? "No deck" : "No deck (make one in Lists)" }),
      decks.map((l) => h("option", { value: l.id, text: `${l.name} (${formatName(l)})` })));
    select.value = app.deckList()?.id ?? "";
  }

  // The deck bar -------------------------------------------------------------------
  const title = h("p", { class: "deck-bar-title", id: "deck-bar-title", tabindex: "-1" });
  const sectionSelect = h("select", {
    id: "deck-section",
    onchange: async () => {
      if (!app.deckMode) return;
      undo = null;
      await app.setDeckMode({ ...app.deckMode, section: sectionSelect.value });
      announce(`+ adds to ${sectionName(sectionSelect.value)}.`);
    },
  });
  const hideBox = h("input", {
    type: "checkbox",
    id: "deck-hide",
    onchange: async () => {
      if (!app.deckMode) return;
      await app.setDeckMode({ ...app.deckMode, hide: hideBox.checked });
      hooks.onHideChange();
    },
  });
  const openLink = h("a", { class: "button ghost", text: "Open deck" });
  const stopBtn = h("button", { type: "button", id: "deck-stop", text: "Stop", onclick: () => stop({ focus: true }) });
  const bar = h("section", { id: "deck-bar", class: "deck-bar", "aria-labelledby": "deck-bar-title", hidden: true },
    title,
    h("div", { class: "deck-bar-controls" },
      field("Adds to", sectionSelect, undefined, TIPS.deckAddsTo),
      h("label", { class: "check", for: "deck-hide" }, hideBox, h("span", { text: "Hide cards in the deck" })),
      h("div", { class: "row wrap deck-bar-actions" }, openLink, withTip(stopBtn, TIPS.deckStop))));
  const hiddenNote = h("p", { id: "deck-hidden-note", class: "hint", "aria-live": "polite", hidden: true });

  function renderBar() {
    const list = app.deckList();
    bar.hidden = !list;
    if (!list) return;
    const s = deckSummary(list);
    replace(title,
      h("strong", { text: list.name }),
      h("span", { class: "deck-bar-count", text: ` · ${s.count} of ${s.size}` }),
      h("span", { class: s.problems ? "deck-bar-problems has-problems" : "deck-bar-problems", text: ` · ${s.problems ? plural(s.problems, "problem") : "No problems"}` }));
    const sections = addSections(list);
    if ([...sectionSelect.options].map((o) => o.value).join() !== sections.join()) {
      replace(sectionSelect, sections.map((x) => h("option", { value: x, text: sectionName(x) })));
    }
    sectionSelect.value = app.deckMode.section;
    hideBox.checked = app.deckMode.hide;
    openLink.href = `#lists/${list.id}`;
  }

  // Start and stop -----------------------------------------------------------------
  async function start(listId, opts = {}) {
    undo = null;
    await app.setDeckMode({ listId, section: "main", hide: false });
    const list = app.deckList();
    if (!list) return;
    hooks.onStart(list);
    announce(`Deck mode: ${list.name}. The filters use the deck's format and colors. Select + on a card to add a copy.`);
    if (opts.focus) title.focus();
  }

  async function stop(opts = {}) {
    undo = null;
    await app.setDeckMode(null);
    hooks.onStop();
    announce("Deck mode is off.");
    if (opts.focus) select.focus();
  }

  // Card controls ------------------------------------------------------------------
  /**
   * The count in the chosen section, with − and +, for one card. It updates
   * itself when the deck changes, so focus stays on the button.
   * @param {import("../cards.js").CardSnapshot} snapshot
   */
  function stepper(snapshot) {
    const key = cardKey(snapshot);
    const name = snapshot.name;
    const count = h("span", { class: "deck-count" });
    const minus = h("button", { type: "button", class: "deck-minus", text: "−", onclick: () => run(() => removeOne(snapshot, item)) });
    const plus = h("button", { type: "button", class: "deck-plus", text: "+", onclick: () => run(() => addOne(snapshot)) });
    const controls = h("div", { class: "deck-stepper" }, minus, count, plus);
    const also = h("p", { class: "deck-also" });
    const limit = h("p", { class: "deck-limit" });
    const undoText = h("span");
    const undoBtn = h("button", { type: "button", class: "undo", text: "Undo", onclick: () => run(() => undoRemove(item)) });
    const undoRow = h("p", { class: "deck-undo" }, undoText, undoBtn);
    const el = h("div", { class: "tile-deck" }, controls, also, limit, undoRow);

    const item = {
      el, minus, plus, undoBtn,
      update() {
        const list = app.deckList();
        el.hidden = !list;
        if (!list) return;
        const section = app.deckMode.section;
        const where = sectionName(section);
        const showUndo = !!undo && undo.key === key && undo.listId === list.id;
        controls.hidden = showUndo;
        undoRow.hidden = !showUndo;
        if (showUndo) {
          undoText.textContent = `Removed from ${sectionName(undo.entry.section)}. `;
          undoBtn.setAttribute("aria-label", `Undo: put ${name} back in ${sectionName(undo.entry.section)}`);
        }
        const counts = deckCounts(list, snapshot);
        const n = counts[section];
        count.textContent = `${n} in ${where}`;
        minus.setAttribute("aria-label", `Remove a copy of ${name} from ${where}`);
        plus.setAttribute("aria-label", `Add a copy of ${name} to ${where}`);
        minus.setAttribute("aria-disabled", String(n === 0));
        const allowed = canAddCopy(list, snapshot, section);
        plus.setAttribute("aria-disabled", String(!allowed));
        const others = addSections(list).filter((s) => s !== section && counts[s] > 0).map((s) => `${counts[s]} in ${sectionName(s)}`);
        also.textContent = others.length ? `Also ${others.join(", ")}` : "";
        also.hidden = others.length === 0 || showUndo;
        limit.textContent = allowed ? "" : `That's the most a ${formatName(list)} deck can have.`;
        limit.hidden = allowed || showUndo;
      },
    };
    steppers.add(item);
    item.update();
    return el;
  }

  async function addOne(snapshot) {
    const list = app.deckList();
    if (!list) return;
    const section = app.deckMode.section;
    if (!canAddCopy(list, snapshot, section)) {
      const r = copyRule(list, snapshot);
      announce(`A ${formatName(list)} deck can have at most ${plural(r.limit, "copy", "copies")} of ${snapshot.name}.`);
      return;
    }
    undo = null;
    const next = addCopy(list, snapshot, section);
    if (await app.saveList(next)) announce(`${snapshot.name}: ${deckCounts(next, snapshot)[section]} in ${sectionName(section)}.`);
  }

  async function removeOne(snapshot, item) {
    const list = app.deckList();
    if (!list) return;
    const section = app.deckMode.section;
    const r = removeCopy(list, snapshot, section);
    if (!r) {
      announce(`${sectionName(section)} has no copies of ${snapshot.name}.`);
      return;
    }
    undo = r.removed ? { key: cardKey(snapshot), listId: list.id, ...r.removed } : null;
    if (await app.saveList(r.list)) {
      if (r.removed) {
        announce(`Removed ${snapshot.name} from ${sectionName(section)}. Undo is available.`);
        item.undoBtn.focus();
      } else {
        announce(`${snapshot.name}: ${deckCounts(r.list, snapshot)[section]} in ${sectionName(section)}.`);
      }
    } else {
      undo = null;
      refresh();
    }
  }

  async function undoRemove(item) {
    const u = undo;
    const list = app.deckList();
    undo = null;
    if (!u || !list || list.id !== u.listId) {
      refresh();
      return;
    }
    if (await app.saveList(restoreEntry(list, u.entry, u.index))) {
      announce(`Put ${u.entry.card.name} back in ${sectionName(u.entry.section)}.`);
      item.minus.focus();
    }
  }

  function refresh() {
    for (const item of steppers) {
      if (!item.el.isConnected) steppers.delete(item);
      else item.update();
    }
    renderMenu();
    renderBar();
  }

  /** True when a card with this key is in the deck and hiding is on. */
  function hides(key) {
    const list = app.deckList();
    return !!list && !!app.deckMode?.hide && isInDeck(list, { oracleId: key, name: key });
  }

  /**
   * Shows the number of hidden cards.
   * @param {number} n
   */
  function showHidden(n) {
    hiddenNote.hidden = n === 0;
    hiddenNote.textContent = n === 0 ? "" : `${n === 1 ? "1 card in the deck is" : `${plural(n, "card")} in the deck are`} hidden. Turn off Hide cards in the deck to see ${n === 1 ? "it" : "them"}.`;
  }

  renderMenu();
  renderBar();

  return { menu, bar, hiddenNote, stepper, refresh, hides, showHidden, start };
}
