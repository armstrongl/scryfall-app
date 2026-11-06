// The "Add to list" panel (PLAN.md section 5.3). It uses a <dialog>
// element, which is part of the page, not a browser dialog.

import { DECK_FORMAT_NAMES, SECTION_NAMES } from "../config.js";
import { addCard, createList } from "../lists.js";
import { announce, checkbox, field, h, message } from "./dom.js";

/**
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 */
export function openAddPanel(app, snapshot) {
  const returnFocus = document.activeElement;
  const lastId = app.settings.lastUsedListId;
  const boxes = app.lists
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((list) => ({ list, ...checkbox(`${list.name} (${list.kind === "deck" ? `${DECK_FORMAT_NAMES[list.format] ?? "Standard"} deck` : "collection"})`, list.id === lastId, null) }));

  const quantity = h("input", { type: "number", min: "1", step: "1", value: "1", inputmode: "numeric", required: true });
  // Main deck first, so it's the default.
  const section = h("select", {}, ["main", "sideboard", "maybe", "commander"].map((s) => h("option", { value: s, text: SECTION_NAMES[s] })));
  const newName = h("input", { type: "text", autocomplete: "off", placeholder: "Name of a new list" });
  const errorSlot = h("div");

  const dialog = h("dialog", { class: "panel", "aria-labelledby": "add-title" });
  const close = () => {
    dialog.close();
    dialog.remove();
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  };

  async function submit(event) {
    event.preventDefault();
    errorSlot.replaceChildren();
    const q = Number(quantity.value);
    if (!Number.isInteger(q) || q < 1) {
      errorSlot.append(message("error", "Enter a quantity of 1 or more."));
      quantity.focus();
      return;
    }
    const targets = boxes.filter((b) => b.input.checked).map((b) => b.list);
    const name = newName.value.trim();
    if (targets.length === 0 && !name) {
      errorSlot.append(message("error", "Choose a list, or enter a name for a new list."));
      return;
    }
    try {
      const names = [];
      let lastUsed = null;
      if (name) {
        const created = addCard(createList(name, "collection"), snapshot, { quantity: q, section: section.value });
        await app.saveList(created);
        names.push(created.name);
        lastUsed = created.id;
      }
      for (const list of targets) {
        const updated = addCard(list, snapshot, { quantity: q, section: section.value });
        await app.saveList(updated);
        names.push(list.name);
      }
      if (targets.length > 0) lastUsed = targets[0].id;
      await app.saveSettings({ lastUsedListId: lastUsed });
      close();
      const where = names.join(", ");
      app.notify(`Added ${q} × ${snapshot.name} to ${where}.`);
    } catch (e) {
      errorSlot.append(message("error", `The card was not saved. ${e.message ?? ""}`.trim()));
    }
  }

  const form = h("form", { method: "dialog", onsubmit: submit },
    h("h2", { id: "add-title", text: `Add ${snapshot.name}` }),
    boxes.length
      ? h("fieldset", { class: "checks list-checks" }, h("legend", { text: "Lists" }), boxes.map((b) => b.el))
      : h("p", { class: "hint", text: "You have no lists yet. Enter a name to make one." }),
    field("New list", newName, "Optional. The app makes this list and adds the card to it."),
    h("div", { class: "grid-2" }, field("Quantity", quantity), field("Section", section)),
    app.storageOk ? null : message("warn", "Storage is not available, so lists are lost when you close the page."),
    errorSlot,
    h("div", { class: "row" },
      h("button", { type: "submit", class: "primary", text: "Add" }),
      h("button", { type: "button", text: "Cancel", onclick: close })));

  dialog.append(form);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  (boxes.find((b) => b.input.checked)?.input ?? boxes[0]?.input ?? newName).focus();
  announce(`Add ${snapshot.name} to a list.`);
}
