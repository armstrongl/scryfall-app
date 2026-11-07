// The Lists view: list index and list detail, with deck checks, deck stats,
// Arena export, Open on Scryfall, and refresh of card data.

import { BACKUP_REMINDER_DAYS, DECK_FORMAT_NAMES, DECK_FORMATS, SECTION_NAMES } from "../config.js";
import { makeSnapshot } from "../cards.js";
import { checkDeck } from "../deck-rules.js";
import { arenaText, needsBackupReminder } from "../export.js";
import {
  applyRefresh, createList, groupBySection, isBrawlFormat, removeEntry, renameList, restoreEntry, scryfallIds,
  sectionsFor, setFormat, setKind, totalQuantity, updateEntry,
} from "../lists.js";
import { FIND_MY_COMBOS_URL, listCombos } from "../combos.js";
import { scryfallListUrls } from "../links.js";
import { deckStats } from "../stats.js";
import { errorMessage } from "../scryfall.js";
import { cardMedia, glowClass, manaCost } from "./card-view.js";
import { openDetails } from "./details.js";
import { openExplore } from "./explore-panel.js";
import { openAddPanel } from "./add-panel.js";
import { TIPS } from "../docs.js";
import { announce, confirmBox, copyText, field, formatDate, h, helpLink, message, plural, replace, withTip } from "./dom.js";

const KIND_LABEL = (list) => (list.kind === "deck" ? `${DECK_FORMAT_NAMES[list.format] ?? "Standard"} deck` : "Collection");
const COLOR_ORDER = ["W", "U", "B", "R", "G"];
const TYPE_LABELS = { creature: "Creatures", planeswalker: "Planeswalkers", battle: "Battles", instant: "Instants", sorcery: "Sorceries", artifact: "Artifacts", enchantment: "Enchantments", land: "Lands", other: "Other" };

/** @param {import("../main.js").App} app */
export function createListsView(app) {
  const el = h("section", { class: "view", id: "view-lists", "aria-labelledby": "lists-title" });
  /** Scryfall IDs that the last refresh did not find, by list ID. Session only. */
  const notFoundByList = new Map();
  let sortBy = "name";
  let refreshing = null;
  /** The last removed entry of a list, shown as an Undo row where it was. */
  const removedByList = new Map();
  let focusUndo = false;

  function reminder() {
    return needsBackupReminder(app.settings, Date.now(), BACKUP_REMINDER_DAYS)
      ? h("p", { class: "msg msg-warn" }, "Your lists changed since your last backup. ", h("a", { href: "#data", text: "Back up your data" }), " so you don't lose them.")
      : null;
  }

  /** Colored dots for the colors in a list. */
  function listPips(list) {
    const colors = new Set(list.entries.flatMap((e) => e.card.colorIdentity ?? []));
    return h("span", { class: "list-pips", "aria-hidden": "true" },
      COLOR_ORDER.filter((c) => colors.has(c)).map((c) => h("span", { class: `pip pip-${c.toLowerCase()}`, text: c })));
  }

  // Index --------------------------------------------------------------------
  function renderIndex() {
    const name = h("input", { type: "text", required: true, autocomplete: "off" });
    const kind = h("select", { onchange: () => { formatField.hidden = kind.value !== "deck"; } },
      h("option", { value: "collection", text: "Collection" }), h("option", { value: "deck", text: "Deck" }));
    const format = h("select", {}, DECK_FORMATS.map((f) => h("option", { value: f, text: DECK_FORMAT_NAMES[f] })));
    const formatField = field("Format", format);
    formatField.hidden = true;
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
        const list = createList(name.value, kind.value, undefined, format.value);
        if (await app.saveList(list)) {
          announce(`Made the list ${list.name}.`);
          location.hash = `#lists/${list.id}`;
        }
      },
    },
    h("h2", { id: "new-list-title", text: "New list" }),
    h("div", { class: "grid-3" }, field("Name", name), field("Kind", kind), formatField),
    err,
    h("button", { type: "submit", class: "primary", text: "Make list" }));

    const lists = app.lists.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    replace(el,
      h("div", { class: "view-head" },
        h("h1", { id: "lists-title", class: "view-title", tabindex: "-1", text: "Lists" }),
        h("p", { class: "tagline", text: "Collections, decks, and brews in progress." })),
      app.storageOk ? null : message("warn", "Storage is not available in this browser window. Lists are lost when you close the page."),
      reminder(),
      lists.length === 0
        ? h("p", { class: "empty", text: "You have no lists yet. Make one here, or add a card from Discover." })
        : h("ul", { class: "list-index" }, lists.map((l) =>
          h("li", {},
            h("a", { href: `#lists/${l.id}`, class: "list-link" },
              h("span", { class: "row-title", text: l.name }),
              h("span", { class: "list-meta" },
                h("span", { class: "badge", text: KIND_LABEL(l) }),
                listPips(l),
                h("span", { class: "hint", text: `${plural(totalQuantity(l.entries), "card")} · changed ${formatDate(l.updatedAt)}` })))))),
      createForm);
  }

  // Detail -------------------------------------------------------------------
  function renderDetail(listId) {
    const list = app.lists.find((l) => l.id === listId);
    if (!list) {
      replace(el,
        h("h1", { id: "lists-title", class: "view-title", tabindex: "-1", text: "List not found" }),
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
    const isDeck = list.kind === "deck";
    const brawl = isDeck && isBrawlFormat(list.format);

    // Main actions.
    const exportBtn = h("button", {
      type: "button",
      class: "primary",
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
        replace(slot, h("section", { class: "panel-box", "aria-labelledby": "export-title" },
          h("h2", { id: "export-title", text: "Export for Arena" }),
          area,
          h("p", { class: "hint", text: brawl
            ? "In MTG Arena, open Decks, then select Import. The app writes a Commander block and a Deck block. The maybe section and the sideboard are not exported."
            : "In MTG Arena, open Decks, then select Import. The maybe section is not exported." }),
          h("div", { class: "row" }, copy, h("button", { type: "button", text: "Close", onclick: () => { slot.replaceChildren(); exportBtn.focus(); } }))));
        copy.focus();
      },
    });
    const combosBtn = h("button", {
      type: "button",
      text: "Find combos",
      disabled: list.entries.length === 0,
      onclick: () => {
        const combos = listCombos(list, app.settings.lastCriteria?.format ?? null);
        const area = h("textarea", { readOnly: true, rows: String(Math.min(12, combos.text.split("\n").length + 1)), class: "mono", value: combos.text, "aria-label": "Decklist for Commander Spellbook" });
        const copy = h("button", {
          type: "button",
          class: "primary",
          text: "Copy",
          onclick: async () => {
            const ok = await copyText(combos.text, area);
            announce(ok ? "Copied the decklist. Paste it into Find My Combos." : "Can't copy automatically. The text is selected, so copy it by hand.");
          },
        });
        replace(slot, h("section", { class: "panel-box", "aria-labelledby": "combos-title" },
          h("h2", { id: "combos-title", text: "Find combos" }),
          h("p", { class: "hint", text: "Commander Spellbook's Find My Combos page finds the combos in a decklist, and the combos it's one card away from. Copy this list, open Find My Combos, paste the list into its decklist box, and select Find New Combos. It shows combos legal in Commander unless you change its filter." }),
          area,
          h("div", { class: "row wrap" },
            copy,
            h("a", { href: FIND_MY_COMBOS_URL, target: "_blank", rel: "noopener", class: "button", text: "Open Find My Combos" }),
            h("button", { type: "button", text: "Close", onclick: () => { slot.replaceChildren(); combosBtn.focus(); } })),
          combos.searches.length ? h("div", {},
            h("h3", { text: "Combos for your commander" }),
            h("ul", { class: "plain" }, combos.searches.map((c) => h("li", {},
              h("a", { href: c.url, target: "_blank", rel: "noopener", text: c.label }),
              h("span", { class: "hint", text: ` ${c.reason}` }))))) : null,
          h("p", { class: "hint", text: "Commander Spellbook is a separate site. Links open it in a new tab." }),
          h("p", { class: "hint" }, helpLink("combos", "Learn more about combos and bracket tags"))));
        copy.focus();
      },
    });
    const urls = scryfallListUrls(list.entries.map((e) => e.card.frontName ?? e.card.name));
    const scryfallLinks = urls.map((u, i) => withTip(h("a", {
      href: u,
      target: "_blank",
      rel: "noopener",
      class: "button",
      text: urls.length > 1 ? `Open on Scryfall (part ${i + 1} of ${urls.length})` : "Open on Scryfall",
    }), TIPS.openList));

    const renameBtn = h("button", {
      type: "button",
      text: "Rename",
      onclick: () => {
        const input = h("input", { type: "text", required: true, value: list.name, autocomplete: "off" });
        const err = h("div");
        replace(slot, h("form", {
          class: "inline-form panel-box",
          onsubmit: async (e) => {
            e.preventDefault();
            if (!input.value.trim()) return replace(err, message("error", "Enter a name for the list."));
            await save(renameList(list, input.value), `Renamed the list to ${input.value.trim()}.`);
          },
        }, field("New name", input), err, h("div", { class: "row" },
          h("button", { type: "submit", class: "primary", text: "Rename" }),
          h("button", { type: "button", text: "Cancel", onclick: () => { slot.replaceChildren(); moreBtn.focus(); } }))));
        input.focus();
      },
    });
    const refreshBtn = h("button", {
      type: "button",
      text: refreshing === list.id ? "Refreshing…" : "Refresh card data",
      disabled: refreshing !== null || list.entries.length === 0,
      onclick: () => refresh(list.id),
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
        onCancel: () => { slot.replaceChildren(); moreBtn.focus(); },
      })),
    });
    const moreMenu = h("div", { id: "list-more", class: "more-menu", hidden: true }, renameBtn, withTip(refreshBtn, TIPS.refresh), deleteBtn);
    const moreBtn = h("button", {
      type: "button",
      id: "list-more-btn",
      class: "ghost",
      "aria-expanded": "false",
      "aria-controls": "list-more",
      text: "More",
      onclick: () => {
        moreMenu.hidden = !moreMenu.hidden;
        moreBtn.setAttribute("aria-expanded", String(!moreMenu.hidden));
        if (!moreMenu.hidden) renameBtn.focus();
      },
    });

    // Settings.
    const kindSelect = h("select", {
      id: "kind-select",
      onchange: () => save(setKind(list, kindSelect.value), `The list is now a ${kindSelect.value === "deck" ? "deck" : "collection"}.`),
    }, h("option", { value: "collection", text: "Collection", selected: list.kind === "collection" }),
    h("option", { value: "deck", text: "Deck", selected: list.kind === "deck" }));
    const formatSelect = h("select", {
      id: "format-select",
      onchange: () => save(setFormat(list, formatSelect.value), `The deck format is now ${DECK_FORMAT_NAMES[formatSelect.value]}.`),
    }, DECK_FORMATS.map((f) => h("option", { value: f, text: DECK_FORMAT_NAMES[f], selected: list.format === f })));
    const formatField = field("Format", formatSelect);
    formatField.hidden = !isDeck;
    const sortSelect = h("select", {
      onchange: () => { sortBy = sortSelect.value; renderDetail(list.id); document.getElementById("sort-select")?.focus(); },
      id: "sort-select",
    }, [["name", "Name"], ["manaValue", "Mana value"], ["type", "Type"]].map(([v, t]) => h("option", { value: v, text: t, selected: sortBy === v })));

    // Deck checks and stats.
    let deckPanel = null;
    if (isDeck) {
      const r = checkDeck(list);
      const formatName = DECK_FORMAT_NAMES[list.format] ?? "Standard";
      deckPanel = h("div", { class: "deck-panel" },
        h("section", { class: "panel-box", "aria-labelledby": "checks-title" },
          h("h2", { id: "checks-title", text: `${formatName} deck checks` }),
          h("p", {}, brawl ? `Deck: ${r.mainCount} cards, counting the commander.` : `Main deck: ${r.mainCount}. Sideboard: ${r.sideboardCount}.`),
          r.results.length === 0
            ? message("ok", "The deck passes all checks.")
            : h("ul", { class: "checks-list" }, r.results.map((x) =>
              h("li", { class: `msg msg-${x.level === "error" ? "error" : "warn"}` }, h("strong", { text: x.level === "error" ? "Error: " : "Warning: " }), x.message))),
          r.legalityAsOf
            ? h("p", { class: "hint" }, `Legality as of ${formatDate(r.legalityAsOf)}. Formats change over time. `,
              h("button", { type: "button", class: "link", text: "Refresh card data", disabled: refreshing !== null, onclick: () => refresh(list.id) }))
            : null,
          h("p", { class: "hint" }, helpLink("lists-and-decks", "Learn more about deck checks"))),
        statsPanel(list));
    }

    // Entries. A just-removed entry stays in its sorted place as an Undo row.
    const pending = removedByList.get(list.id);
    const shown = pending && !list.entries.some((e) => e.id === pending.entry.id)
      ? [...list.entries, { ...pending.entry, removed: true }] : list.entries;
    // Sections come from the shown entries, so the Undo row's section stays.
    const sections = sectionsFor({ ...list, entries: shown });
    const groups = groupBySection(shown, sortBy, sections);
    const sectionEls = groups.map((g) => {
      const total = totalQuantity(g.entries.filter((e) => !e.removed));
      return h("section", { class: "panel-box", "aria-labelledby": `sec-${g.section}` },
        h("h2", { id: `sec-${g.section}`, text: `${SECTION_NAMES[g.section]} (${total})` }),
        g.entries.length === 0
          ? h("p", { class: "empty", text: g.section === "commander" ? "No commander yet. Move a legendary creature or planeswalker here with its Section menu." : "No cards." })
          : h("ul", { class: "entries" }, g.entries.map((e) => (e.removed
            ? removedRow(list, pending)
            : entryRow(list, e, sections, notFound.has(e.card.scryfallId), save)))));
    });

    replace(el,
      h("p", { class: "crumb" }, h("a", { href: "#lists", text: "← All lists" })),
      h("div", { class: "view-head" },
        h("h1", { id: "lists-title", class: "view-title", tabindex: "-1", text: list.name }),
        h("p", { class: "tagline" }, h("span", { class: "badge", text: KIND_LABEL(list) }), ` ${plural(totalQuantity(list.entries), "card")}`)),
      app.storageOk ? null : message("warn", "Storage is not available in this browser window. Lists are lost when you close the page."),
      reminder(),
      h("div", { class: "list-actions" }, withTip(exportBtn, TIPS.exportArena), withTip(combosBtn, TIPS.findCombos), scryfallLinks, moreBtn),
      moreMenu,
      slot,
      h("div", { class: "toolbar" }, field("Kind", kindSelect, undefined, TIPS.listKind), formatField, field("Sort by", sortSelect)),
      refreshNote(list.id),
      deckPanel,
      sectionEls);
  }

  /** Mana curve, colors, and card types for the main deck. */
  function statsPanel(list) {
    const s = deckStats(list.entries);
    const max = Math.max(1, ...s.curve);
    const pipTotal = Object.values(s.pips).reduce((a, b) => a + b, 0);
    return h("section", { class: "panel-box deck-stats", "aria-labelledby": "stats-title" },
      h("h2", { id: "stats-title", text: "Deck stats" }),
      h("p", { class: "hint", text: `${plural(s.total, "card")}: ${plural(s.lands, "land")}, ${plural(s.total - s.lands, "spell")}. Average mana value of spells: ${s.averageManaValue.toFixed(2)}.` }),
      h("figure", { class: "curve-fig" },
        h("figcaption", { text: "Mana curve (spells)" }),
        h("ol", { class: "curve" }, s.curve.map((n, i) => h("li", { "aria-label": `Mana value ${i === 7 ? "7 or more" : i}: ${n}` },
          h("span", { class: "bar-count", text: String(n) }),
          h("span", { class: "bar", style: `--h: ${Math.round((n / max) * 100)}%` }),
          h("span", { class: "bar-label", text: i === 7 ? "7+" : String(i) }))))),
      h("div", { class: "stat-row" },
        h("div", {},
          h("h3", { text: "Colors (mana symbols)" }),
          pipTotal === 0 ? h("p", { class: "hint", text: "No colored mana symbols." })
            : h("ul", { class: "pip-list" }, COLOR_ORDER.filter((c) => s.pips[c]).map((c) =>
              h("li", {}, h("span", { class: `pip pip-${c.toLowerCase()}`, "aria-hidden": "true", text: c }), ` ${s.pips[c]} (${Math.round((s.pips[c] / pipTotal) * 100)}%)`)))),
        h("div", {},
          h("h3", { text: "Types" }),
          h("ul", { class: "type-list" }, Object.entries(s.types).filter(([, n]) => n).map(([t, n]) => h("li", { text: `${TYPE_LABELS[t]}: ${n}` }))))));
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

  function entryRow(list, entry, sections, isNotFound, save) {
    const card = entry.card;
    const qty = h("input", {
      type: "number", min: "1", step: "1", value: String(entry.quantity), inputmode: "numeric", class: "qty",
      onchange: () => {
        const n = Number(qty.value);
        if (!Number.isInteger(n) || n < 1) {
          qty.value = String(entry.quantity);
          announce("Quantity must be a whole number, 1 or more. To remove a card, select Remove.");
          return;
        }
        save(updateEntry(list, entry.id, { quantity: n }), `${card.name}: quantity ${n}.`);
      },
    });
    const section = h("select", {
      onchange: () => save(updateEntry(list, entry.id, { section: section.value }), `Moved ${card.name} to ${SECTION_NAMES[section.value]}.`),
    }, sections.map((s) => h("option", { value: s, text: SECTION_NAMES[s], selected: s === entry.section })));
    const note = h("input", {
      type: "text", value: entry.note, autocomplete: "off", placeholder: "Note",
      onchange: () => save(updateEntry(list, entry.id, { note: note.value }), "Saved the note."),
    });
    const remove = h("button", {
      type: "button",
      class: "ghost",
      text: "Remove",
      "aria-label": `Remove ${card.name}`,
      onclick: async () => {
        const index = list.entries.findIndex((e) => e.id === entry.id);
        removedByList.set(list.id, { entry, index });
        focusUndo = true;
        if (await save(removeEntry(list, entry.id))) {
          announce(`Removed ${card.name}. Undo is available where the card was.`);
        } else {
          removedByList.delete(list.id);
          focusUndo = false;
        }
      },
    });
    const details = () => openDetails(app, card, { onAdd: () => openAddPanel(app, card), onExplore: () => openExplore(app, card) });
    return h("li", { class: `row-item entry ${glowClass(card)}`, dataset: { entryId: entry.id } },
      cardMedia(card, { size: "small", lazy: true }),
      h("div", { class: "row-body" },
        h("div", { class: "tile-head" },
          h("p", { class: "row-title" }, h("button", { type: "button", class: "link name-link", text: card.name, "aria-label": `Details for ${card.name}`, onclick: details })),
          manaCost(card.manaCost)),
        h("p", { class: "hint", text: `${card.typeLine} · ${card.setName}` }),
        isNotFound ? h("p", { class: "msg msg-warn", text: "Not found on Scryfall" }) : null,
        h("div", { class: "entry-controls" },
          field("Quantity", qty),
          field("Section", section),
          field("Note", note)),
        h("div", { class: "row wrap" },
          h("button", { type: "button", class: "ghost", text: "Explore", "aria-label": `Explore ${card.name}`, onclick: () => openExplore(app, card) }),
          remove)));
  }

  /** The row left behind by Remove, with Undo. */
  function removedRow(list, pending) {
    const { entry, index } = pending;
    return h("li", { class: "removed", dataset: { entryId: `removed-${entry.id}` } },
      h("p", { text: `Removed ${entry.quantity} × ${entry.card.name}.` }),
      h("button", {
        type: "button",
        class: "undo",
        text: "Undo",
        "aria-label": "Undo",
        onclick: async () => {
          const latest = app.lists.find((l) => l.id === list.id);
          removedByList.delete(list.id);
          if (latest && await app.saveList(restoreEntry(latest, entry, index))) {
            announce(`Put ${entry.card.name} back.`);
            const row = el.querySelector(`li[data-entry-id="${CSS.escape(entry.id)}"]`);
            row?.querySelector("button, input, select")?.focus();
          }
        },
      }),
      h("button", {
        type: "button",
        class: "ghost",
        text: "Dismiss",
        "aria-label": `Dismiss: removed ${entry.card.name}`,
        onclick: () => {
          removedByList.delete(list.id);
          render();
          el.querySelector("h1")?.focus();
        },
      }));
  }

  let currentId = null;
  function render() {
    // Keep focus on the same control when a change re-renders the view. Rows
    // are found by entry ID, so a re-sort doesn't move focus to another row.
    const active = document.activeElement;
    const activeKey = active && el.contains(active) ? describe(active) : null;
    if (currentId) renderDetail(currentId);
    else renderIndex();
    if (focusUndo) {
      focusUndo = false;
      const undo = el.querySelector(".removed .undo");
      if (undo) return undo.focus();
    }
    if (activeKey) restore(activeKey);
  }

  /** Controls that can take focus: not hidden and not disabled. */
  function focusable(scope) {
    return [...scope.querySelectorAll("input, select, button, a, textarea")]
      .filter((c) => !c.disabled && c.getClientRects().length > 0);
  }
  function describe(node) {
    // The More menu closes on re-render, so its buttons go back to More.
    if (node.closest("#list-more")) return { rowId: null, id: "list-more-btn", controlIndex: -1 };
    const row = node.closest("li");
    const rowId = row?.dataset.entryId ?? null;
    return { rowId, id: node.id || null, controlIndex: focusable(row ?? el).indexOf(node) };
  }
  function restore({ rowId, id, controlIndex }) {
    const byId = id ? document.getElementById(id) : null;
    if (byId && !byId.disabled && byId.getClientRects().length > 0) return byId.focus();
    const scope = rowId ? el.querySelector(`li[data-entry-id="${CSS.escape(rowId)}"]`) : el;
    const target = scope && controlIndex >= 0 ? focusable(scope)[controlIndex] : null;
    (target ?? el.querySelector("h1"))?.focus?.();
  }

  return {
    el,
    /** @param {string|null} listId */
    show(listId) {
      if (listId !== currentId) removedByList.clear();
      currentId = listId;
      render();
    },
    refresh: render,
  };
}
