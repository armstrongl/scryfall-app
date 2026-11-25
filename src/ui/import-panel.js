// The Import deck panel in Lists: paste deck text, look up the cards, fix or
// skip the lines that didn't match, and save to a new or existing list.

import { DECK_FORMAT_NAMES, DECK_FORMATS } from "../config.js";
import { addImported, arenaSetCodes, lookUpCards, parseCardLine, parseDeckText } from "../deck-import.js";
import { createList, setFormat, totalQuantity } from "../lists.js";
import { errorMessage } from "../scryfall.js";
import { announce, field, h, helpLink, message, plural, replace } from "./dom.js";

const NEW_LIST = "";
const REASONS = {
  notCard: "Not a card line. Start it with the number of copies, such as 4 Llanowar Elves.",
  notFound: "Scryfall has no card with this name. Check the spelling.",
};

/**
 * @param {import("../main.js").App} app
 * @param {{onClose: () => void}} options
 * @returns {{el: HTMLElement, focus: () => void, refreshTargets: () => void}}
 */
export function createImportPanel(app, { onClose }) {
  /** @type {{line: import("../deck-import.js").CardLine, card: any}[]} */
  let found = [];
  /** @type {{line: number, text: string, section: string, reason: "notCard"|"notFound", tried: string}[]} */
  let pending = [];
  let skipped = 0;
  let looked = false;
  let busy = false;
  /** @type {AbortController|null} */
  let controller = null;

  const text = h("textarea", { id: "import-text", rows: "10", class: "mono", spellcheck: "false", autocomplete: "off" });
  const target = h("select", { id: "import-target" });
  const name = h("input", { id: "import-name", type: "text", autocomplete: "off" });
  const format = h("select", { id: "import-format" }, DECK_FORMATS.map((f) => h("option", { value: f, text: DECK_FORMAT_NAMES[f] })));
  const nameField = field("Name", name);
  const results = h("div", { class: "import-results" });
  const err = h("div");
  const lookUpBtn = h("button", { type: "button", class: "primary", text: "Look up cards", onclick: () => lookUp() });
  const saveBtn = h("button", { type: "button", text: "Save list", onclick: () => save() });
  const saveRow = h("div", { class: "row", hidden: true }, saveBtn);

  text.addEventListener("input", () => {
    if (!looked) return;
    found = [];
    pending = [];
    skipped = 0;
    looked = false;
    renderResults();
  });
  target.addEventListener("change", () => {
    const list = app.lists.find((l) => l.id === target.value);
    nameField.hidden = !!list;
    if (list) format.value = list.format;
  });

  function refreshTargets() {
    const keep = target.value;
    const lists = app.lists.slice().sort((a, b) => a.name.localeCompare(b.name));
    replace(target, h("option", { value: NEW_LIST, text: "A new list" }), lists.map((l) => h("option", { value: l.id, text: l.name })));
    target.value = lists.some((l) => l.id === keep) ? keep : NEW_LIST;
    const chosen = lists.find((l) => l.id === target.value);
    nameField.hidden = !!chosen;
    if (chosen) format.value = chosen.format;
  }
  refreshTargets();

  function setBusy(on) {
    busy = on;
    lookUpBtn.disabled = on;
    saveBtn.disabled = on;
    // The results belong to the text that was looked up, so it can't change meanwhile.
    text.readOnly = on;
    if (!on) lookUpBtn.textContent = "Look up cards";
    for (const b of results.querySelectorAll("button")) b.disabled = on;
  }

  function summary() {
    const total = found.length + pending.length;
    const parts = [`Found ${found.length} of ${plural(total, "card line")}.`];
    if (skipped) parts.push(`Skipped ${plural(skipped, "line")}.`);
    return parts.join(" ");
  }

  function renderResults() {
    lookUpBtn.className = looked ? "" : "primary";
    saveBtn.className = looked ? "primary" : "";
    saveRow.hidden = !looked;
    if (!looked) return replace(results);
    const rows = pending.map((p) => {
      const input = h("input", { type: "text", value: p.text, autocomplete: "off", spellcheck: "false", class: "mono", "aria-label": `Line ${p.line}` });
      input.addEventListener("input", () => { p.text = input.value; });
      const reasonId = `import-reason-${p.line}`;
      input.setAttribute("aria-describedby", reasonId);
      return h("li", { dataset: { line: String(p.line) } },
        input,
        h("p", { class: "hint", id: reasonId, text: REASONS[p.reason] }),
        h("button", { type: "button", class: "ghost", text: "Skip", "aria-label": `Skip line ${p.line}`, onclick: () => skip([p]) }));
    });
    replace(results,
      message(pending.length ? "warn" : "ok", summary()),
      pending.length ? h("div", {},
        h("h3", { text: "Lines that didn't match" }),
        h("p", { class: "hint", text: "Fix a line, then select Look up again. Or select Skip to leave it out." }),
        h("ul", { class: "import-problems" }, rows),
        h("div", { class: "row wrap" },
          h("button", { type: "button", text: "Look up again", onclick: () => lookUpAgain() }),
          h("button", { type: "button", text: "Skip all", onclick: () => skip(pending.slice()) }))) : null);
  }

  /** Looks up card lines through the queue, with set codes when a line has one. */
  async function find(lines) {
    controller = new AbortController();
    const signal = controller.signal;
    const needSets = lines.some((l) => l.set && l.number);
    const setCodes = needSets ? arenaSetCodes(await app.client.setsBody()) : new Map();
    return lookUpCards(lines, { setCodes, collection: (ids) => app.client.cards(ids, signal) });
  }

  async function lookUp() {
    if (busy) return;
    replace(err);
    const parsed = parseDeckText(text.value);
    if (parsed.cards.length === 0 && parsed.problems.length === 0) {
      replace(err, message("error", "Paste deck text first."));
      text.focus();
      return;
    }
    if (parsed.name && !name.value.trim()) name.value = parsed.name;
    setBusy(true);
    lookUpBtn.textContent = "Looking up…";
    announce("Looking up the cards.");
    try {
      const r = await find(parsed.cards);
      found = r.found;
      pending = [
        ...parsed.problems.map((p) => ({ ...p, reason: /** @type {const} */ ("notCard"), tried: p.text })),
        ...r.notFound.map((l) => ({ line: l.line, text: l.text, section: l.section, reason: /** @type {const} */ ("notFound"), tried: l.text })),
      ].sort((a, b) => a.line - b.line);
      skipped = 0;
      looked = true;
      setBusy(false);
      renderResults();
      announce(summary());
      (results.querySelector(".import-problems input") ?? saveBtn).focus();
    } catch (e) {
      setBusy(false);
      if (e?.kind === "cancelled") return;
      replace(err, message("error", errorMessage(e)));
      announce(errorMessage(e));
    }
  }

  async function lookUpAgain() {
    if (busy) return;
    replace(err);
    const lines = [];
    for (const p of pending) {
      if (p.text.trim() === p.tried) continue;
      p.tried = p.text.trim();
      const card = parseCardLine(p.text);
      if (card) lines.push({ line: p.line, text: p.tried, ...card, section: p.section });
      else p.reason = "notCard";
    }
    setBusy(true);
    announce("Looking up the cards.");
    try {
      const r = lines.length ? await find(lines) : { found: [], notFound: [] };
      const fixed = new Set(r.found.map((f) => f.line.line));
      for (const l of r.notFound) {
        const p = pending.find((x) => x.line === l.line);
        if (p) p.reason = "notFound";
      }
      pending = pending.filter((p) => !fixed.has(p.line));
      found = [...found, ...r.found].sort((a, b) => a.line.line - b.line.line);
      setBusy(false);
      renderResults();
      announce(summary());
      (results.querySelector(".import-problems input") ?? saveBtn).focus();
    } catch (e) {
      setBusy(false);
      if (e?.kind === "cancelled") return;
      replace(err, message("error", errorMessage(e)));
      announce(errorMessage(e));
    }
  }

  function skip(items) {
    const drop = new Set(items.map((p) => p.line));
    pending = pending.filter((p) => !drop.has(p.line));
    skipped += drop.size;
    renderResults();
    announce(summary());
    (results.querySelector(".import-problems input") ?? saveBtn).focus();
  }

  async function save() {
    if (busy) return;
    replace(err);
    if (pending.length) {
      replace(err, message("error", "Fix or skip the lines that didn't match first."));
      results.querySelector(".import-problems input")?.focus();
      return;
    }
    if (found.length === 0) {
      replace(err, message("error", "No cards to save. Paste deck text, then select Look up cards."));
      text.focus();
      return;
    }
    let list;
    if (target.value === NEW_LIST) {
      if (!name.value.trim()) {
        replace(err, message("error", "Enter a name for the list."));
        name.focus();
        return;
      }
      list = createList(name.value, "deck", undefined, format.value);
    } else {
      list = app.lists.find((l) => l.id === target.value);
      if (!list) {
        refreshTargets();
        replace(err, message("error", "That list no longer exists. Choose another list."));
        target.focus();
        return;
      }
      if (list.format !== format.value) list = setFormat(list, format.value);
    }
    const next = addImported(list, found, new Date().toISOString());
    const added = totalQuantity(next.entries) - totalQuantity(list.entries);
    // Busy until the save ends, so a double press saves once.
    setBusy(true);
    const ok = await app.saveList(next);
    setBusy(false);
    if (ok) {
      announce(`Imported ${plural(added, "card")} into ${next.name}.`);
      reset();
      onClose();
      location.hash = `#lists/${next.id}`;
    }
  }

  function reset() {
    controller?.abort();
    controller = null;
    found = [];
    pending = [];
    skipped = 0;
    looked = false;
    busy = false;
    text.value = "";
    name.value = "";
    target.value = NEW_LIST;
    nameField.hidden = false;
    format.value = DECK_FORMATS[0];
    replace(err);
    setBusy(false);
    renderResults();
  }

  const el = h("section", { class: "panel-box import-panel", "aria-labelledby": "import-title" },
    h("h2", { id: "import-title", text: "Import deck" }),
    h("p", { class: "hint", text: "Paste the text from the Export button in MTG Arena, or a deck list from a site such as MTGGoldfish or Untapped.gg. Lines with a set code and collector number keep that printing." }),
    field("Deck text", text),
    h("div", { class: "grid-3" }, field("Import into", target), nameField, field("Format", format)),
    h("div", { class: "row wrap" }, lookUpBtn, h("button", { type: "button", text: "Cancel", onclick: () => { reset(); onClose(); } })),
    results,
    err,
    saveRow,
    h("p", { class: "hint" }, helpLink("lists-and-decks", "Learn more about importing decks")));

  return { el, focus: () => text.focus(), refreshTargets };
}
