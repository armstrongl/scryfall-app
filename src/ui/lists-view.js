// The Lists view: list index and list detail, with deck checks, Arena
// export, and refresh of card data.

import { BACKUP_REMINDER_DAYS, SECTION_NAMES, SECTIONS } from "../config.js";
import { makeSnapshot } from "../cards.js";
import { checkDeck } from "../deck-rules.js";
import { arenaText, needsBackupReminder } from "../export.js";
import {
  applyRefresh, createList, groupBySection, removeEntry, renameList, scryfallIds, setKind,
  totalQuantity, updateEntry,
} from "../lists.js";
import { errorMessage } from "../scryfall.js";
import { cardMedia } from "./card-view.js";
import { openSynergyPanel } from "./synergy-panel.js";
import { announce, confirmBox, copyText, field, formatDate, h, message, plural, replace } from "./dom.js";

/** @param {import("../main.js").App} app */
export function createListsView(app) {
  const el = h("section", { class: "view", id: "view-lists", "aria-labelledby": "lists-title" });
  /** Scryfall IDs that the last refresh did not find, by list ID. Session only. */
  const notFoundByList = new Map();
  let sortBy = "name";
  let refreshing = null;

  function reminder() {
    return needsBackupReminder(app.settings, Date.now(), BACKUP_REMINDER_DAYS)
      ? h("p", { class: "msg msg-warn" }, "Your lists changed since your last backup. ", h("a", { href: "#data", text: "Export a backup" }), " so you don't lose them.")
      : null;
  }

  // Index --------------------------------------------------------------------
  function renderIndex() {
    const name = h("input", { type: "text", required: true, autocomplete: "off" });
    const kind = h("select", {}, h("option", { value: "collection", text: "Collection" }), h("option", { value: "deck", text: "Deck (Standard)" }));
    const err = h("div");
    const createForm = h("form", {
      class: "panel-box",
      "aria-labelledby": "new-list-title",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!name.value.trim()) {
          replace(err, message("error", "Enter a name for the list."));
          name.focus();
          return;
        }
        const list = createList(name.value, kind.value);
        if (await app.saveList(list)) {
          announce(`Made the list ${list.name}.`);
          location.hash = `#lists/${list.id}`;
        }
      },
    },
    h("h2", { id: "new-list-title", text: "New list" }),
    h("div", { class: "grid-2" }, field("Name", name), field("Kind", kind)),
    err,
    h("button", { type: "submit", class: "primary", text: "Make list" }));

    const lists = app.lists.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    replace(el,
      h("h1", { id: "lists-title", class: "view-title", text: "Lists" }),
      app.storageOk ? null : message("warn", "Storage is not available in this browser window. Lists are lost when you close the page."),
      reminder(),
      lists.length === 0
        ? h("p", { class: "empty", text: "You have no lists yet. Make one here, or add a card from Discover." })
        : h("ul", { class: "list-index" }, lists.map((l) =>
          h("li", {},
            h("a", { href: `#lists/${l.id}`, class: "list-link" },
              h("span", { class: "row-title", text: l.name }),
              h("span", { class: "hint", text: `${l.kind === "deck" ? "Deck" : "Collection"} · ${plural(totalQuantity(l.entries), "card")} · changed ${formatDate(l.updatedAt)}` }))))),
      createForm);
  }

  // Detail -------------------------------------------------------------------
  function renderDetail(listId) {
    const list = app.lists.find((l) => l.id === listId);
    if (!list) {
      replace(el,
        h("h1", { id: "lists-title", class: "view-title", text: "List not found" }),
        h("p", {}, "This list does not exist. ", h("a", { href: "#lists", text: "Go to all lists" }), "."));
      return;
    }
    const notFound = notFoundByList.get(list.id) ?? new Set();
    const slot = h("div", { class: "action-slot" });
    const save = async (next, text) => {
      if (await app.saveList(next)) {
        if (text) announce(text);
        return true;
      }
      return false;
    };

    // Header actions.
    const renameBtn = h("button", {
      type: "button",
      text: "Rename",
      onclick: () => {
        const input = h("input", { type: "text", required: true, value: list.name, autocomplete: "off" });
        const err = h("div");
        replace(slot, h("form", {
          class: "inline-form",
          onsubmit: async (e) => {
            e.preventDefault();
            if (!input.value.trim()) return replace(err, message("error", "Enter a name for the list."));
            await save(renameList(list, input.value), `Renamed the list to ${input.value.trim()}.`);
          },
        }, field("New name", input), err, h("div", { class: "row" },
          h("button", { type: "submit", class: "primary", text: "Rename" }),
          h("button", { type: "button", text: "Cancel", onclick: () => { slot.replaceChildren(); renameBtn.focus(); } }))));
        input.focus();
      },
    });
    const kindSelect = h("select", {
      onchange: () => save(setKind(list, kindSelect.value), `The list is now a ${kindSelect.value}.`),
    }, h("option", { value: "collection", text: "Collection", selected: list.kind === "collection" }),
    h("option", { value: "deck", text: "Deck (Standard)", selected: list.kind === "deck" }));
    const sortSelect = h("select", {
      onchange: () => { sortBy = sortSelect.value; renderDetail(list.id); focusById("sort-select"); },
      id: "sort-select",
    }, [["name", "Name"], ["manaValue", "Mana value"], ["type", "Type"]].map(([v, t]) => h("option", { value: v, text: t, selected: sortBy === v })));

    const refreshBtn = h("button", {
      type: "button",
      text: refreshing === list.id ? "Refreshing…" : "Refresh card data",
      disabled: refreshing !== null || list.entries.length === 0,
      onclick: () => refresh(list.id),
    });
    const exportBtn = h("button", {
      type: "button",
      text: "Export for Arena",
      disabled: list.entries.length === 0,
      onclick: () => {
        const text = arenaText(list);
        const area = h("textarea", { readOnly: true, rows: String(Math.min(20, text.split("\n").length + 1)), class: "mono", value: text, "aria-label": "Arena deck text" });
        const copy = h("button", {
          type: "button",
          class: "primary",
          text: "Copy",
          onclick: async () => {
            const ok = await copyText(text, area);
            announce(ok ? "Copied the deck text." : "Can't copy automatically. The text is selected, so copy it by hand.");
          },
        });
        replace(slot, h("div", { class: "panel-box" },
          h("h2", { text: "Arena export" }),
          h("p", { class: "hint", text: "In MTG Arena, open Decks, then select Import. The maybe section is not exported." }),
          area,
          h("div", { class: "row" }, copy, h("button", { type: "button", text: "Close", onclick: () => { slot.replaceChildren(); exportBtn.focus(); } }))));
        copy.focus();
      },
    });
    const deleteBtn = h("button", {
      type: "button",
      class: "danger-outline",
      text: "Delete list",
      onclick: () => replace(slot, confirmBox({
        message: `Delete ${list.name} and its ${plural(totalQuantity(list.entries), "card")}? You can't undo this.`,
        confirmLabel: "Delete list",
        onConfirm: async () => {
          if (await app.deleteList(list.id)) {
            announce(`Deleted the list ${list.name}.`);
            location.hash = "#lists";
          }
        },
        onCancel: () => { slot.replaceChildren(); deleteBtn.focus(); },
      })),
    });

    // Deck checks.
    let checks = null;
    if (list.kind === "deck") {
      const r = checkDeck(list);
      checks = h("section", { class: "panel-box", "aria-labelledby": "checks-title" },
        h("h2", { id: "checks-title", text: "Standard deck checks" }),
        h("p", {}, `Main deck: ${r.mainCount}. Sideboard: ${r.sideboardCount}.`),
        r.results.length === 0
          ? message("ok", "The deck passes all checks.")
          : h("ul", { class: "checks-list" }, r.results.map((x) =>
            h("li", { class: `msg msg-${x.level === "error" ? "error" : "warn"}` }, h("strong", { text: x.level === "error" ? "Error: " : "Warning: " }), x.message))),
        r.legalityAsOf
          ? h("p", { class: "hint" }, `Legality as of ${formatDate(r.legalityAsOf)}. Standard changes over time. `,
            h("button", { type: "button", class: "link", text: "Refresh card data", disabled: refreshing !== null, onclick: () => refresh(list.id) }))
          : null);
    }

    // Entries.
    const groups = groupBySection(list.entries, sortBy);
    const sections = groups.map((g) => h("section", { class: "panel-box", "aria-labelledby": `sec-${g.section}` },
      h("h2", { id: `sec-${g.section}`, text: `${SECTION_NAMES[g.section]} (${g.total})` }),
      g.entries.length === 0
        ? h("p", { class: "empty", text: "No cards." })
        : h("ul", { class: "entries" }, g.entries.map((e) => entryRow(list, e, notFound.has(e.card.scryfallId), save)))));

    replace(el,
      h("p", {}, h("a", { href: "#lists", text: "All lists" })),
      h("h1", { id: "lists-title", class: "view-title", text: list.name }),
      app.storageOk ? null : message("warn", "Storage is not available in this browser window. Lists are lost when you close the page."),
      reminder(),
      h("div", { class: "toolbar" },
        field("Kind", kindSelect),
        field("Sort by", sortSelect),
        h("div", { class: "row wrap" }, renameBtn, refreshBtn, exportBtn, deleteBtn)),
      slot,
      refreshNote(list.id),
      checks,
      sections);
  }

  const refreshNotes = new Map();
  function refreshNote(listId) {
    const n = refreshNotes.get(listId);
    return n ? message(n.kind, n.text) : null;
  }

  async function refresh(listId) {
    const list = app.lists.find((l) => l.id === listId);
    if (!list || refreshing) return;
    refreshing = listId;
    refreshNotes.delete(listId);
    render();
    announce("Refreshing card data.");
    try {
      const { data, notFound } = await app.client.collection(scryfallIds(list));
      const now = new Date().toISOString();
      const map = new Map(data.map((card) => [card.id, makeSnapshot(card, now)]));
      // The list can change while the requests run, so apply to the newest copy.
      const latest = app.lists.find((l) => l.id === listId) ?? list;
      const result = applyRefresh(latest, map);
      const missing = new Set([...result.notFound, ...notFound.map((x) => x.id).filter(Boolean)]);
      notFoundByList.set(listId, missing);
      if (await app.saveList(result.list)) {
        const text = missing.size
          ? `Refreshed ${plural(map.size, "card")}. ${plural(missing.size, "card")} not found on Scryfall. They keep their old data.`
          : `Refreshed ${plural(map.size, "card")}.`;
        refreshNotes.set(listId, { kind: missing.size ? "warn" : "ok", text });
        announce(text);
      }
    } catch (e) {
      const text = errorMessage(e);
      refreshNotes.set(listId, { kind: "error", text });
      announce(text);
    } finally {
      refreshing = null;
      render();
    }
  }

  function entryRow(list, entry, isNotFound, save) {
    const qty = h("input", {
      type: "number", min: "1", step: "1", value: String(entry.quantity), inputmode: "numeric", class: "qty",
      onchange: () => {
        const n = Number(qty.value);
        if (!Number.isInteger(n) || n < 1) {
          qty.value = String(entry.quantity);
          announce("Quantity must be a whole number, 1 or more. To remove a card, select Remove.");
          return;
        }
        save(updateEntry(list, entry.id, { quantity: n }), `${entry.card.name}: quantity ${n}.`);
      },
    });
    const section = h("select", {
      onchange: () => save(updateEntry(list, entry.id, { section: section.value }), `Moved ${entry.card.name} to ${SECTION_NAMES[section.value]}.`),
    }, SECTIONS.map((s) => h("option", { value: s, text: SECTION_NAMES[s], selected: s === entry.section })));
    const note = h("input", {
      type: "text", value: entry.note, autocomplete: "off",
      onchange: () => save(updateEntry(list, entry.id, { note: note.value }), "Saved the note."),
    });
    const remove = h("button", {
      type: "button", text: "Remove",
      onclick: () => save(removeEntry(list, entry.id), `Removed ${entry.card.name}.`),
    });
    return h("li", { class: "row-item entry" },
      cardMedia(entry.card, { size: "small", lazy: true }),
      h("div", { class: "row-body" },
        h("p", { class: "row-title" }, h("a", { href: entry.card.scryfallUri, target: "_blank", rel: "noopener", text: entry.card.name })),
        h("p", { class: "hint", text: `${entry.card.typeLine} · ${entry.card.setName}` }),
        isNotFound ? h("p", { class: "msg msg-warn", text: "Not found on Scryfall" }) : null,
        h("div", { class: "entry-controls" },
          field("Quantity", qty),
          field("Section", section),
          field("Note", note)),
        h("div", { class: "row wrap" },
          h("button", { type: "button", text: "Find synergies", "aria-label": `Find synergies for ${entry.card.name}`, onclick: () => openSynergyPanel(app, entry.card) }),
          remove)));
  }

  function focusById(id) {
    document.getElementById(id)?.focus();
  }

  let currentId = null;
  function render() {
    // Keep focus on the same control when a change re-renders the view.
    const active = document.activeElement;
    const activeKey = active && el.contains(active) ? describe(active) : null;
    if (currentId) renderDetail(currentId);
    else renderIndex();
    if (activeKey) restore(activeKey);
  }

  function describe(node) {
    const row = node.closest("li");
    const rows = row ? [...el.querySelectorAll("li")] : [];
    const controls = [...(row ?? el).querySelectorAll("input, select, button, a, textarea")];
    return { rowIndex: rows.indexOf(row), controlIndex: controls.indexOf(node) };
  }
  function restore({ rowIndex, controlIndex }) {
    const rows = [...el.querySelectorAll("li")];
    const scope = rowIndex >= 0 ? rows[rowIndex] : el;
    const target = scope ? [...scope.querySelectorAll("input, select, button, a, textarea")][controlIndex] : null;
    (target ?? el.querySelector("h1"))?.focus?.();
  }

  return {
    el,
    /** @param {string|null} listId */
    show(listId) {
      currentId = listId;
      render();
    },
    refresh: render,
  };
}
