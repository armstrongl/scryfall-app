// The Discover view: presets, criteria, pool size, draw, results, history.

import { MAX_DRAW, MIN_DRAW, POOL_DEBOUNCE_MS } from "../config.js";
import { cardKey, makeSnapshot } from "../cards.js";
import { drawBatch, planCount } from "../draw.js";
import { buildQuery, defaultCriteria, normalizeCriteria, scryfallSearchUrl } from "../query.js";
import { errorMessage } from "../scryfall.js";
import { openAddPanel } from "./add-panel.js";
import { cardMedia, cardView } from "./card-view.js";
import { createCriteriaForm } from "./criteria-form.js";
import { announce, confirmBox, copyText, field, formatDate, formatNumber, h, message, plural, replace } from "./dom.js";

export const BUILT_IN_PRESET = Object.freeze({
  id: "builtin-arena-standard",
  name: "Arena Standard",
  builtIn: true,
  criteria: defaultCriteria(),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/** @param {import("../main.js").App} app */
export function createDiscoverView(app) {
  /** Pool results for this session, by query string. */
  const poolCache = new Map();
  let poolTimer = null;
  let poolController = null;
  let current = buildQuery(app.settings.lastCriteria);
  let drawController = null;

  // Presets ----------------------------------------------------------------
  const presetSelect = h("select", { onchange: () => syncPresetButtons() });
  const presetSlot = h("div", { class: "preset-slot" });
  const applyBtn = h("button", { type: "button", text: "Apply", onclick: applyPreset });
  const saveBtn = h("button", { type: "button", text: "Save as new preset", onclick: () => showNameForm("save") });
  const renameBtn = h("button", { type: "button", text: "Rename", onclick: () => showNameForm("rename") });
  const deleteBtn = h("button", { type: "button", text: "Delete", onclick: confirmDelete });

  function allPresets() {
    return [BUILT_IN_PRESET, ...app.presets.slice().sort((a, b) => a.name.localeCompare(b.name))];
  }
  function selectedPreset() {
    return allPresets().find((p) => p.id === presetSelect.value) ?? BUILT_IN_PRESET;
  }
  function renderPresets(selectId = presetSelect.value) {
    replace(presetSelect, allPresets().map((p) => h("option", { value: p.id, text: p.builtIn ? `${p.name} (built in)` : p.name })));
    presetSelect.value = allPresets().some((p) => p.id === selectId) ? selectId : BUILT_IN_PRESET.id;
    syncPresetButtons();
  }
  function syncPresetButtons() {
    const builtIn = selectedPreset().builtIn;
    renameBtn.disabled = builtIn;
    deleteBtn.disabled = builtIn;
  }
  function applyPreset() {
    const p = selectedPreset();
    form.set(p.criteria);
    onCriteria(form.get());
    announce(`Applied the preset ${p.name}.`);
  }
  function showNameForm(mode) {
    const p = selectedPreset();
    const input = h("input", { type: "text", required: true, autocomplete: "off", value: mode === "rename" ? p.name : "" });
    const err = h("div");
    const f = h("form", {
      class: "inline-form",
      onsubmit: async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) {
          replace(err, message("error", "Enter a name for the preset."));
          return;
        }
        const now = new Date().toISOString();
        const preset = mode === "rename"
          ? { ...p, name }
          : { id: crypto.randomUUID(), name, builtIn: false, criteria: form.get(), createdAt: now, updatedAt: now };
        if (await app.savePreset(preset)) {
          presetSlot.replaceChildren();
          renderPresets(preset.id);
          announce(mode === "rename" ? `Renamed the preset to ${name}.` : `Saved the preset ${name}.`);
          presetSelect.focus();
        }
      },
    },
    field(mode === "rename" ? "New name" : "Preset name", input),
    err,
    h("div", { class: "row" },
      h("button", { type: "submit", class: "primary", text: mode === "rename" ? "Rename" : "Save" }),
      h("button", { type: "button", text: "Cancel", onclick: () => { presetSlot.replaceChildren(); presetSelect.focus(); } })));
    replace(presetSlot, f);
    input.focus();
  }
  function confirmDelete() {
    const p = selectedPreset();
    if (p.builtIn) return;
    replace(presetSlot, confirmBox({
      message: `Delete the preset ${p.name}? You can't undo this.`,
      confirmLabel: "Delete preset",
      onConfirm: async () => {
        if (await app.deletePreset(p.id)) {
          presetSlot.replaceChildren();
          renderPresets(BUILT_IN_PRESET.id);
          announce(`Deleted the preset ${p.name}.`);
          presetSelect.focus();
        }
      },
      onCancel: () => { presetSlot.replaceChildren(); deleteBtn.focus(); },
    }));
  }

  // Criteria and preview ----------------------------------------------------
  const form = createCriteriaForm((c) => onCriteria(c));
  const previewCode = h("code", { class: "query" });
  const previewNotes = h("div", { class: "preview-notes" });
  const poolLine = h("p", { class: "pool", "aria-live": "polite" });
  const openLink = h("a", { class: "button", target: "_blank", rel: "noopener", text: "Open on Scryfall" });
  const copyBtn = h("button", {
    type: "button",
    text: "Copy query",
    onclick: async () => {
      const ok = await copyText(current.query, previewCode);
      announce(ok ? "Copied the query." : "Can't copy automatically. The query is selected, so copy it by hand.");
    },
  });

  function onCriteria(criteria) {
    current = buildQuery(criteria);
    renderPreview();
    app.saveSettings({ lastCriteria: criteria }, { quiet: true });
    schedulePool();
  }

  function renderPreview() {
    if (!current.query) previewCode.textContent = "(no criteria: any card)";
    else {
      // One span for each space-separated part, so lines break between
      // terms and not at a hyphen. The text content stays the same query.
      const parts = current.query.split(" ");
      replace(previewCode, parts.flatMap((p, i) => [
        h("span", { class: p.length > 30 ? "term long" : "term", text: p }),
        i < parts.length - 1 ? " " : null,
      ]));
    }
    openLink.href = scryfallSearchUrl(current.query);
    form.showHints(current.hints);
    const notes = [];
    if (current.error) notes.push(message("error", current.error));
    const cached = poolCache.get(current.query);
    for (const w of cached?.warnings ?? []) notes.push(message("warn", `Scryfall ignored part of the query: ${w}`));
    replace(previewNotes, notes);
    copyBtn.disabled = !current.query;
    openLink.toggleAttribute("aria-disabled", !current.query);
  }

  // Pool size ----------------------------------------------------------------
  function knownPoolSize() {
    const cached = poolCache.get(current.query);
    return cached && typeof cached.total === "number" ? cached.total : null;
  }

  function showPool() {
    if (current.error) return replace(poolLine, "");
    if (!current.query) return replace(poolLine, "Add a criterion to see how many cards match.");
    const cached = poolCache.get(current.query);
    if (!cached) return replace(poolLine, "Counting cards…");
    if (cached.error) return replace(poolLine, h("span", { class: "msg-error", text: cached.error }));
    replace(poolLine, `${formatNumber(cached.total)} ${cached.total === 1 ? "card matches" : "cards match"}`);
  }

  function schedulePool() {
    clearTimeout(poolTimer);
    poolController?.abort();
    showPool();
    if (current.error || !current.query || poolCache.has(current.query)) return;
    poolTimer = setTimeout(fetchPool, POOL_DEBOUNCE_MS);
  }

  async function fetchPool() {
    const query = current.query;
    const controller = new AbortController();
    poolController = controller;
    try {
      const list = await app.client.search(query, { unique: "cards" }, controller.signal);
      poolCache.set(query, { total: list.total_cards, warnings: list.warnings ?? [] });
    } catch (e) {
      if (e.kind === "cancelled") return;
      if (e.kind === "notFound") poolCache.set(query, { total: 0, warnings: [] });
      else if (e.kind === "badRequest") poolCache.set(query, { error: errorMessage(e), warnings: [] });
      else {
        // Do not cache network or server errors, so a later change retries.
        if (query === current.query) replace(poolLine, h("span", { class: "msg-error", text: errorMessage(e) }));
        return;
      }
    }
    // Never show a count for a query that is not the current query.
    if (query === current.query) {
      showPool();
      renderPreview();
    }
  }

  // Draw ---------------------------------------------------------------------
  const countInput = h("input", { type: "number", min: String(MIN_DRAW), max: String(MAX_DRAW), step: "1", value: "1", inputmode: "numeric" });
  const drawBtn = h("button", { type: "button", class: "primary big", text: "Draw", onclick: draw });
  const cancelBtn = h("button", { type: "button", text: "Cancel", hidden: true, onclick: () => drawController?.abort() });
  const progress = h("p", { class: "progress" });
  const drawNotes = h("div", { class: "draw-notes" });
  const results = h("div", { class: "results", "aria-label": "Draw results" });

  async function draw() {
    if (drawController) return;
    if (current.error) {
      replace(drawNotes, message("error", current.error));
      return;
    }
    const pool = knownPoolSize();
    const plan = planCount(countInput.value, pool);
    countInput.value = String(plan.count || countInput.value);
    const notes = [];
    if (plan.count === 0) {
      replace(drawNotes, message("error", "No cards match these criteria. Remove a filter and try again."));
      announce("No cards match these criteria.");
      return;
    }
    if (plan.reduced) notes.push(message("info", `Only ${plan.count} ${plan.count === 1 ? "card matches" : "cards match"}, so the app draws ${plan.count}.`));
    replace(drawNotes, notes);
    results.replaceChildren();

    const query = current.query;
    const controller = new AbortController();
    drawController = controller;
    drawBtn.disabled = true;
    cancelBtn.hidden = false;
    const found = [];
    try {
      const r = await drawBatch({
        client: app.client,
        query,
        count: plan.count,
        keyOf: (card) => cardKey(makeSnapshot(card, "")),
        signal: controller.signal,
        onProgress: ({ found: n, count }) => {
          progress.textContent = count > 1 ? `Drawing ${Math.min(n + 1, count)} of ${count}` : "Drawing…";
        },
        onCard: (card) => {
          const snapshot = makeSnapshot(card, new Date().toISOString());
          found.push(snapshot);
          results.append(resultCard(snapshot, card, query));
          app.addHistory({ id: crypto.randomUUID(), card: snapshot, query, drawnAt: snapshot.fetchedAt });
        },
      });
      if (controller.signal.aborted) {
        drawNotes.append(message("info", `Draw cancelled. ${found.length} ${found.length === 1 ? "card" : "cards"} drawn.`));
        announce(`Draw cancelled. ${plural(found.length, "card")} drawn.`);
      } else if (r.stoppedEarly) {
        drawNotes.append(message("info", `Found ${r.cards.length} unique ${r.cards.length === 1 ? "card" : "cards"} after ${r.attempts} tries. The pool may be small.`));
        announce(`Drew ${plural(r.cards.length, "unique card")}.`);
      } else {
        announce(found.length === 1 ? `Drew ${found[0].name}.` : `Drew ${found.length} cards: ${found.map((s) => s.name).join(", ")}.`);
      }
    } catch (e) {
      if (e.kind === "cancelled") {
        drawNotes.append(message("info", `Draw cancelled. ${found.length} ${found.length === 1 ? "card" : "cards"} drawn.`));
        announce("Draw cancelled.");
      } else {
        const text = errorMessage(e);
        drawNotes.append(message("error", found.length ? `${text} The app drew ${found.length} before the error.` : text));
        announce(text);
      }
    } finally {
      drawController = null;
      drawBtn.disabled = false;
      cancelBtn.hidden = true;
      progress.textContent = "";
      renderHistory();
    }
  }

  function resultCard(snapshot, card, query) {
    const extra = [];
    if (query.includes("game:arena") && Array.isArray(card.games) && !card.games.includes("arena")) {
      extra.push(h("p", { class: "msg msg-warn", text: "Scryfall does not list this printing on Arena." }));
    }
    return cardView(snapshot, { onAdd: () => openAddPanel(app, snapshot), extra });
  }

  // History ------------------------------------------------------------------
  const historyList = h("ol", { class: "history" });
  const historySlot = h("div");
  const clearBtn = h("button", {
    type: "button",
    text: "Clear history",
    onclick: () => replace(historySlot, confirmBox({
      message: "Clear the draw history? You can't undo this.",
      confirmLabel: "Clear history",
      onConfirm: async () => {
        await app.clearHistory();
        historySlot.replaceChildren();
        renderHistory();
        announce("Cleared the history.");
        clearBtn.focus();
      },
      onCancel: () => { historySlot.replaceChildren(); clearBtn.focus(); },
    })),
  });

  function renderHistory() {
    clearBtn.disabled = app.history.length === 0;
    if (app.history.length === 0) {
      replace(historyList, h("li", { class: "empty", text: "Cards you draw show here." }));
      return;
    }
    replace(historyList, app.history.map((item) =>
      h("li", { class: "row-item" },
        cardMedia(item.card, { size: "small", lazy: true }),
        h("div", { class: "row-body" },
          h("p", { class: "row-title" }, h("a", { href: item.card.scryfallUri, target: "_blank", rel: "noopener", text: item.card.name })),
          h("p", { class: "hint", text: item.card.typeLine }),
          h("p", { class: "hint" }, h("time", { datetime: item.drawnAt, text: formatDate(item.drawnAt) })),
          h("p", { class: "hint mono", text: item.query || "(any card)" }),
          h("button", { type: "button", text: "Add to list", onclick: () => openAddPanel(app, item.card) })))));
  }

  // Layout -------------------------------------------------------------------
  const el = h("section", { class: "view", id: "view-discover", "aria-labelledby": "discover-title" },
    h("h1", { id: "discover-title", class: "view-title", text: "Discover" }),
    h("div", { class: "layout-discover" },
      h("div", { class: "col-criteria" },
        h("section", { class: "panel-box", "aria-labelledby": "presets-title" },
          h("h2", { id: "presets-title", text: "Presets" }),
          field("Preset", presetSelect),
          h("div", { class: "row wrap" }, applyBtn, saveBtn, renameBtn, deleteBtn),
          presetSlot),
        h("section", { class: "panel-box", "aria-label": "Criteria" },
          h("details", { class: "collapse", open: window.matchMedia("(min-width: 1000px)").matches },
            h("summary", { text: "Criteria" }),
            form.el))),
      h("div", { class: "col-results" },
        h("section", { class: "panel-box", "aria-labelledby": "query-title" },
          h("h2", { id: "query-title", text: "Query" }),
          h("p", { class: "query-wrap" }, previewCode),
          previewNotes,
          h("div", { class: "row wrap" }, copyBtn, openLink),
          poolLine,
          h("div", { class: "draw-row" }, field("Cards to draw", countInput), drawBtn, cancelBtn),
          progress,
          drawNotes),
        results,
        h("section", { class: "panel-box", "aria-labelledby": "history-title" },
          h("div", { class: "row space" }, h("h2", { id: "history-title", text: "History" }), clearBtn),
          historySlot,
          historyList))));

  form.set(normalizeCriteria(app.settings.lastCriteria));
  current = buildQuery(form.get());
  renderPresets(BUILT_IN_PRESET.id);
  renderPreview();
  renderHistory();
  schedulePool();

  return {
    el,
    refresh() {
      renderPresets();
      renderHistory();
    },
  };
}
