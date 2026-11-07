// The Discover view: presets, filters, and two ways to see cards. Draw shows
// random cards, preferring cards not drawn recently for the same search. Browse lists every match, sorted the way the user picks,
// page by page. Cards show as tiles, with details in an inspector beside
// them on wide screens and in a sheet everywhere.

import { MAX_DRAW, MIN_DRAW, POOL_DEBOUNCE_MS, SMALL_POOL_SIZE } from "../config.js";
import { cardKey, makeSnapshot } from "../cards.js";
import { drawBatch, planCount, recentKeys, sampleFromPool } from "../draw.js";
import { SORT_DIRECTIONS, SORT_OPTIONS, browseParams, emptyBrowse, mergePage, normalizeSort } from "../browse.js";
import { buildQuery, defaultCriteria, filterChips, normalizeCriteria, scryfallSearchUrl } from "../query.js";
import { errorMessage } from "../scryfall.js";
import { openAddPanel } from "./add-panel.js";
import { openExplore } from "./explore-panel.js";
import { createInspector, openDetails } from "./details.js";
import { cardMedia, cardTile, fillSaved } from "./card-view.js";
import { createCriteriaForm } from "./criteria-form.js";
import { announce, confirmBox, field, formatDate, formatNumber, h, message, plural, replace } from "./dom.js";

export const BUILT_IN_PRESET = Object.freeze({
  id: "builtin-arena-standard",
  name: "Arena Standard",
  builtIn: true,
  criteria: defaultCriteria(),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/**
 * Arena's 100-card Brawl, with colors read as color identity. On 2026-11-05
 * the API listed no rebalanced card as legal in Brawl (is:rebalanced
 * f:brawl found nothing), so leaving them out changes nothing.
 */
export const BRAWL_PRESET = Object.freeze({
  id: "builtin-arena-brawl",
  name: "Arena Brawl",
  builtIn: true,
  criteria: { ...defaultCriteria(), format: "brawl", useIdentity: true },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const BUILT_INS = [BUILT_IN_PRESET, BRAWL_PRESET];

/** @param {import("../main.js").App} app */
export function createDiscoverView(app) {
  /** Pool results for this session, by query string. */
  const poolCache = new Map();
  /** First pages of search results for this session, by query and sort. */
  const pageCache = new Map();
  let poolTimer = null;
  let poolController = null;
  let current = buildQuery(app.settings.lastCriteria);
  let drawController = null;
  let browseController = null;
  let browse = emptyBrowse("");
  let mode = app.settings.discoverMode === "browse" ? "browse" : "draw";
  let sort = normalizeSort(app.settings.browseSort);
  const inspector = createInspector(app);

  // Card actions -----------------------------------------------------------------
  const actions = (snapshot) => ({
    onDetails: () => openDetails(app, snapshot, { onAdd: () => openAddPanel(app, snapshot), onExplore: () => openExplore(app, snapshot) }),
    onExplore: () => openExplore(app, snapshot),
    onAdd: () => openAddPanel(app, snapshot),
  });

  /** A tile wired to the inspector. */
  function tile(snapshot, extra = [], index) {
    const a = actions(snapshot);
    const el = cardTile(snapshot, { ...a, saved: app.savedIn(snapshot), extra, lazy: index > 3, index });
    const inspect = () => inspector.show(snapshot, { onAdd: a.onAdd, onExplore: a.onExplore });
    el.addEventListener("mouseover", inspect);
    el.addEventListener("focusin", inspect);
    return el;
  }

  // Presets ----------------------------------------------------------------------
  const presetSelect = h("select", { onchange: () => syncPresetButtons() });
  const presetSlot = h("div", { class: "preset-slot" });
  const applyBtn = h("button", { type: "button", text: "Apply", onclick: applyPreset });
  const saveBtn = h("button", { type: "button", text: "Save as preset", onclick: () => showNameForm("save") });
  const renameBtn = h("button", { type: "button", class: "ghost", text: "Rename", onclick: () => showNameForm("rename") });
  const deleteBtn = h("button", { type: "button", class: "ghost", text: "Delete", onclick: confirmDelete });

  function allPresets() {
    return [...BUILT_INS, ...app.presets.slice().sort((a, b) => a.name.localeCompare(b.name))];
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
    // The built-in preset can't be renamed or deleted, so hide those buttons.
    renameBtn.hidden = builtIn;
    deleteBtn.hidden = builtIn;
  }
  function applyPreset() {
    const p = selectedPreset();
    form.set(p.criteria);
    onCriteria(form.get());
    announce(`Applied the preset ${p.name}.`);
  }
  function showNameForm(formMode) {
    const p = selectedPreset();
    const input = h("input", { type: "text", required: true, autocomplete: "off", value: formMode === "rename" ? p.name : "" });
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
        const preset = formMode === "rename"
          ? { ...p, name }
          : { id: crypto.randomUUID(), name, builtIn: false, criteria: form.get(), createdAt: now, updatedAt: now };
        if (await app.savePreset(preset)) {
          presetSlot.replaceChildren();
          renderPresets(preset.id);
          announce(formMode === "rename" ? `Renamed the preset to ${name}.` : `Saved the preset ${name}.`);
          presetSelect.focus();
        }
      },
    },
    field(formMode === "rename" ? "New name" : "Preset name", input),
    err,
    h("div", { class: "row" },
      h("button", { type: "submit", class: "primary", text: formMode === "rename" ? "Rename" : "Save" }),
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

  // Filters, chips, and preview ----------------------------------------------------
  const form = createCriteriaForm((c) => onCriteria(c));
  const filtersPanel = h("div", { id: "filters-panel", class: "filters-panel", hidden: true }, form.el);
  const filtersToggle = h("button", {
    type: "button",
    id: "filters-toggle",
    class: "filters-toggle",
    "aria-expanded": "false",
    "aria-controls": "filters-panel",
    onclick: () => setFiltersOpen(filtersPanel.hidden),
  }, h("span", { class: "chev", "aria-hidden": "true" }), h("span", { text: "Filters" }));
  function setFiltersOpen(open) {
    filtersPanel.hidden = !open;
    filtersToggle.setAttribute("aria-expanded", String(open));
  }
  const chipList = h("ul", { class: "chips", "aria-label": "Active filters" });
  const previewNotes = h("div", { class: "preview-notes" });
  const poolLine = h("p", { class: "pool", "aria-live": "polite" });
  // The page doesn't show the query itself. Scryfall's site shows it.
  const openLink = h("a", { id: "open-scryfall", class: "button ghost", target: "_blank", rel: "noopener", text: "Open on Scryfall" });

  function onCriteria(criteria) {
    current = buildQuery(criteria);
    renderPreview();
    app.saveSettings({ lastCriteria: criteria }, { quiet: true });
    schedulePool();
    if (browse.cards.length && browse.query !== current.query) {
      replace(browseStatus, "The filters changed. Select Show cards to update the list.");
    }
  }

  function renderChips() {
    const chips = filterChips(form.get());
    if (chips.length === 0) {
      replace(chipList, h("li", { class: "chip chip-empty", text: "No filters: any card" }));
      return;
    }
    replace(chipList, chips.map((c) => h("li", { class: "chip" },
      h("span", { text: c.label }),
      h("button", {
        type: "button",
        class: "chip-x",
        "aria-label": `Remove filter: ${c.label}`,
        text: "×",
        onclick: () => {
          form.set({ ...form.get(), ...c.clear });
          onCriteria(form.get());
          announce(`Removed the filter ${c.label}.`);
          (chipList.querySelector(".chip-x") ?? filtersToggle).focus();
        },
      }))));
  }

  function renderPreview() {
    openLink.href = scryfallSearchUrl(current.query);
    form.showHints(current.hints);
    renderChips();
    const notes = [];
    if (current.error) notes.push(message("error", current.error));
    const cached = poolCache.get(current.query);
    for (const w of cached?.warnings ?? []) notes.push(message("warn", `Scryfall ignored part of the query: ${w}`));
    replace(previewNotes, notes);
    openLink.toggleAttribute("aria-disabled", !current.query);
  }

  // Pool size --------------------------------------------------------------------
  function knownPoolSize() {
    const cached = poolCache.get(current.query);
    return cached && typeof cached.total === "number" ? cached.total : null;
  }

  function showPool() {
    if (current.error) return replace(poolLine, "");
    if (!current.query) return replace(poolLine, "Add a filter to see how many cards match.");
    const cached = poolCache.get(current.query);
    if (!cached) return replace(poolLine, h("span", { class: "counting", text: "Counting cards…" }));
    if (cached.error) return replace(poolLine, h("span", { class: "msg-error", text: cached.error }));
    replace(poolLine, h("strong", { text: formatNumber(cached.total) }), ` ${cached.total === 1 ? "card matches" : "cards match"}`);
  }

  function schedulePool() {
    clearTimeout(poolTimer);
    poolController?.abort();
    showPool();
    if (current.error || !current.query || poolCache.has(current.query)) return;
    poolTimer = setTimeout(fetchPool, POOL_DEBOUNCE_MS);
  }

  const pageKey = (query, s, page) => `${query}\n${s.order}\n${s.dir}\n${page}`;
  const NAME_SORT = { order: "name", dir: "auto" };

  async function fetchPool() {
    const query = current.query;
    const controller = new AbortController();
    poolController = controller;
    try {
      const params = browseParams(NAME_SORT, 1);
      const list = await app.client.search(query, params, controller.signal);
      poolCache.set(query, { total: list.total_cards, warnings: list.warnings ?? [] });
      // The count's first page is also Browse's first page in name order.
      cachePage(pageKey(query, NAME_SORT, 1), list);
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

  // Mode switch --------------------------------------------------------------------
  const modeDraw = h("button", { type: "button", id: "mode-draw", class: "seg", "aria-pressed": "true", onclick: () => setMode("draw", true) },
    "Draw random");
  const modeBrowse = h("button", { type: "button", id: "mode-browse", class: "seg", "aria-pressed": "false", onclick: () => setMode("browse", true) },
    "Browse all");
  const drawControls = h("div", { class: "control-row" });
  const browseControls = h("div", { class: "control-row" });

  /** Stops any draw or Browse load that is still running. */
  function cancelAll() {
    drawController?.abort();
    browseController?.abort();
    drawController = null;
    browseController = null;
    drawBtn.disabled = false;
    showBtn.disabled = false;
    loadMoreBtn.disabled = false;
    cancelBtn.hidden = true;
    progress.textContent = "";
  }

  function setMode(next, user) {
    mode = next;
    modeDraw.setAttribute("aria-pressed", String(mode === "draw"));
    modeBrowse.setAttribute("aria-pressed", String(mode === "browse"));
    drawControls.hidden = mode !== "draw";
    browseControls.hidden = mode !== "browse";
    loadMoreBtn.hidden = mode !== "browse" || !browse.hasMore;
    if (user) {
      cancelAll();
      app.saveSettings({ discoverMode: mode }, { quiet: true });
      results.replaceChildren();
      inspector.clear();
      browse = emptyBrowse("");
      replace(browseStatus, mode === "browse" ? "Choose a sort, then select Show cards." : "");
      drawNotes.replaceChildren();
      announce(mode === "draw" ? "Draw random cards." : "Browse every matching card.");
    }
  }

  // Draw -------------------------------------------------------------------------
  const countInput = h("input", { id: "draw-count", type: "number", min: String(MIN_DRAW), max: String(MAX_DRAW), step: "1", value: "3", inputmode: "numeric", class: "count" });
  const drawBtn = h("button", { type: "button", id: "draw-btn", class: "primary big", text: "Draw", onclick: draw });
  const cancelBtn = h("button", { type: "button", text: "Cancel", hidden: true, onclick: () => { drawController?.abort(); browseController?.abort(); } });
  const progress = h("p", { class: "progress", "aria-live": "polite" });
  const drawNotes = h("div", { class: "draw-notes" });
  const browseStatus = h("p", { class: "browse-status", tabindex: "-1", "aria-live": "polite" });
  const results = h("div", { class: "results", role: "region", "aria-label": "Cards" });
  const loadMoreBtn = h("button", { type: "button", class: "load-more", hidden: true, text: "Load more", onclick: () => loadPage(false) });

  replace(drawControls, field(`Cards (${MIN_DRAW} to ${MAX_DRAW})`, countInput), drawBtn);

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
      replace(drawNotes, message("error", "No cards match these filters. Remove a filter and try again."));
      announce("No cards match these filters.");
      return;
    }
    if (plan.reduced) notes.push(message("info", `Only ${plan.count} ${plan.count === 1 ? "card matches" : "cards match"}, so the app draws ${plan.count}.`));
    replace(drawNotes, notes);
    results.replaceChildren();
    inspector.clear();
    browseStatus.textContent = "";

    const query = current.query;
    const controller = new AbortController();
    drawController = controller;
    drawBtn.disabled = true;
    cancelBtn.hidden = false;
    results.classList.add("revealing");
    const found = [];
    const keyOf = (card) => cardKey(makeSnapshot(card, ""));
    // Cards drawn before for this same search. The draw prefers others.
    const recent = recentKeys(app.history, query);
    const onCard = (card) => {
      if (drawController !== controller) return;
      const snapshot = makeSnapshot(card, new Date().toISOString());
      const extra = [];
      if (query.includes("game:arena") && Array.isArray(card.games) && !card.games.includes("arena")) {
        extra.push(h("p", { class: "msg msg-warn", text: "Scryfall does not list this printing on Arena." }));
      }
      results.append(tile(snapshot, extra, found.length));
      found.push(snapshot);
      app.addHistory({ id: crypto.randomUUID(), card: snapshot, query, drawnAt: snapshot.fetchedAt });
    };
    try {
      let r;
      if (pool !== null && pool <= SMALL_POOL_SIZE) {
        // A small pool fits on one search page: one request, then a local
        // draw that can take every new card before a recent one.
        progress.textContent = "Drawing…";
        const key = pageKey(query, NAME_SORT, 1);
        const list = pageCache.get(key) ?? await app.client.search(query, browseParams(NAME_SORT, 1), controller.signal);
        cachePage(key, list);
        const s = sampleFromPool(list.data ?? [], plan.count, keyOf, recent);
        s.cards.forEach(onCard);
        r = { cards: s.cards, attempts: 1, stoppedEarly: s.cards.length < plan.count, repeats: s.repeats };
      } else {
        r = await drawBatch({
          client: app.client,
          query,
          count: plan.count,
          keyOf,
          recent,
          signal: controller.signal,
          onProgress: ({ found: n, count }) => {
            progress.textContent = count > 1 ? `Drawing ${Math.min(n + 1, count)} of ${count}…` : "Drawing…";
          },
          onCard,
        });
      }
      // A draw replaced by a mode switch or a new search says nothing.
      if (drawController !== controller) return;
      if (r.repeats > 0 && !controller.signal.aborted) {
        drawNotes.append(message("info", `${plural(r.repeats, "card")} ${r.repeats === 1 ? "was" : "were"} also in your recent draws for this search, because there weren't enough new ones.`));
      }
      if (controller.signal.aborted) {
        drawNotes.append(message("info", `Draw cancelled. ${plural(found.length, "card")} drawn.`));
        announce(`Draw cancelled. ${plural(found.length, "card")} drawn.`);
      } else if (r.stoppedEarly) {
        drawNotes.append(message("info", `Found ${plural(r.cards.length, "unique card")} after ${r.attempts} tries. The pool may be small.`));
        announce(`Drew ${plural(r.cards.length, "unique card")}.`);
      } else {
        announce(found.length === 1 ? `Drew ${found[0].name}.` : `Drew ${found.length} cards: ${found.map((s) => s.name).join(", ")}.`);
      }
    } catch (e) {
      if (drawController !== controller) return;
      if (e.kind === "cancelled") {
        drawNotes.append(message("info", `Draw cancelled. ${plural(found.length, "card")} drawn.`));
        announce("Draw cancelled.");
      } else {
        const text = errorMessage(e);
        drawNotes.append(message("error", found.length ? `${text} The app drew ${found.length} before the error.` : text));
        announce(text);
      }
    } finally {
      if (drawController === controller) {
        drawController = null;
        drawBtn.disabled = false;
        cancelBtn.hidden = true;
        progress.textContent = "";
      }
      renderHistory();
    }
  }

  // Browse -----------------------------------------------------------------------
  const sortSelect = h("select", {
    id: "browse-sort",
    onchange: () => setSort({ ...sort, order: sortSelect.value }),
  }, SORT_OPTIONS.map((o) => h("option", { value: o.value, text: o.label })));
  const dirSelect = h("select", {
    id: "browse-dir",
    onchange: () => setSort({ ...sort, dir: dirSelect.value }),
  }, SORT_DIRECTIONS.map((o) => h("option", { value: o.value, text: o.label })));
  const showBtn = h("button", { type: "button", class: "primary big", text: "Show cards", onclick: () => loadPage(true) });
  replace(browseControls, field("Sort by", sortSelect), field("Order", dirSelect), showBtn);

  /**
   * @param {any} next
   * @param {{quiet?: boolean, persist?: boolean}} [opts] quiet: don't reload.
   *   persist: false keeps the user's saved sort, for example for Explore.
   */
  function setSort(next, opts = {}) {
    sort = normalizeSort(next);
    sortSelect.value = sort.order;
    dirSelect.value = sort.dir;
    if (opts.persist !== false) app.saveSettings({ browseSort: sort }, { quiet: true });
    // Reload when cards are shown or a load is running, so pages never mix sorts.
    if (!opts.quiet && (browse.cards.length || browseController)) loadPage(true);
  }

  /** Keeps the session page cache small. */
  function cachePage(key, list) {
    pageCache.set(key, list);
    while (pageCache.size > 20) pageCache.delete(pageCache.keys().next().value);
  }

  /**
   * Loads the first page (fresh) or the next page. Each page is one request
   * of up to 175 cards. A first page in name order may come from the count.
   */
  async function loadPage(fresh) {
    if (current.error) {
      replace(drawNotes, message("error", current.error));
      return;
    }
    browseController?.abort();
    const controller = new AbortController();
    browseController = controller;
    if (fresh) {
      browse = emptyBrowse(current.query, sort);
      results.replaceChildren();
      inspector.clear();
      results.classList.add("revealing");
    }
    const page = browse.nextPage;
    // Every page of one list uses the sort the list started with.
    const key = pageKey(browse.query, browse.sort, page);
    showBtn.disabled = true;
    loadMoreBtn.disabled = true;
    cancelBtn.hidden = false;
    replace(browseStatus, page === 1 ? "Loading cards…" : `Loading page ${page}…`);
    try {
      const list = pageCache.get(key) ?? await app.client.search(browse.query, browseParams(browse.sort, page), controller.signal);
      // A load replaced by a newer one, a mode switch, or a new search does nothing.
      if (browseController !== controller) return;
      if (page === 1) cachePage(key, list);
      const start = browse.cards.length;
      browse = mergePage(browse, list);
      const now = new Date().toISOString();
      browse.cards.slice(start).forEach((card, i) => results.append(tile(makeSnapshot(card, now), [], fresh ? i : 99)));
      const name = SORT_OPTIONS.find((o) => o.value === browse.sort.order)?.label ?? browse.sort.order;
      const label = name[0].toLowerCase() + name.slice(1);
      replace(browseStatus, `Showing ${formatNumber(browse.cards.length)} of ${formatNumber(browse.total ?? browse.cards.length)} cards, sorted by ${label}.`);
      announce(`Showing ${browse.cards.length} of ${browse.total} cards.`);
    } catch (e) {
      if (browseController !== controller) return;
      if (e.kind === "cancelled") {
        replace(browseStatus, browse.cards.length ? `Showing ${formatNumber(browse.cards.length)} cards.` : "Cancelled.");
      } else if (e.kind === "notFound") {
        browse = { ...browse, hasMore: false };
        replace(browseStatus, "No cards match these filters. Remove a filter and try again.");
      } else {
        replace(browseStatus, errorMessage(e));
      }
      announce(browseStatus.textContent);
    } finally {
      if (browseController === controller) {
        browseController = null;
        finishLoad();
      }
    }
  }

  /** Puts the Browse controls back after a load ends. */
  function finishLoad() {
    showBtn.disabled = false;
    loadMoreBtn.disabled = false;
    cancelBtn.hidden = true;
    loadMoreBtn.hidden = mode !== "browse" || !browse.hasMore;
    if (browse.hasMore && browse.total) {
      loadMoreBtn.textContent = `Load more (${formatNumber(browse.total - browse.cards.length)} left)`;
    }
  }

  // History ------------------------------------------------------------------------
  const historyList = h("ol", { class: "history" });
  const historySlot = h("div");
  const clearBtn = h("button", {
    type: "button",
    class: "ghost",
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
  const historyCount = h("span", { class: "hint" });

  function renderHistory() {
    clearBtn.disabled = app.history.length === 0;
    historyCount.textContent = app.history.length ? ` (${app.history.length})` : "";
    if (app.history.length === 0) {
      replace(historyList, h("li", { class: "empty", text: "Cards you draw show here." }));
      return;
    }
    replace(historyList, app.history.map((item) => {
      const a = actions(item.card);
      const saved = h("p", { class: "tile-saved" });
      fillSaved(saved, app.savedIn(item.card));
      return h("li", { class: "row-item", dataset: { cardKey: cardKey(item.card) } },
        cardMedia(item.card, { size: "small", lazy: true }),
        h("div", { class: "row-body" },
          h("p", { class: "row-title", text: item.card.name }),
          h("p", { class: "hint", text: item.card.typeLine }),
          saved,
          h("p", { class: "hint" }, h("time", { datetime: item.drawnAt, text: formatDate(item.drawnAt) })),
          h("div", { class: "row wrap" },
            h("button", { type: "button", class: "ghost", text: "Details", "aria-label": `Details for ${item.card.name}`, onclick: a.onDetails }),
            h("button", { type: "button", class: "ghost", text: "Explore", "aria-label": `Explore ${item.card.name}`, onclick: a.onExplore }),
            h("button", { type: "button", text: "Add", "aria-label": `Add ${item.card.name} to a list`, onclick: a.onAdd }))));
    }));
  }

  /** Updates every saved marker, after lists change. */
  function refreshSaved() {
    const index = new Map();
    for (const node of el.querySelectorAll("[data-card-key]")) {
      const marker = node.querySelector(".tile-saved");
      if (!marker) continue;
      const key = node.dataset.cardKey;
      if (!index.has(key)) {
        // savedIn needs a snapshot-like object: oracleId or name gives the key.
        index.set(key, app.savedIn({ oracleId: key, name: key }));
      }
      fillSaved(marker, index.get(key));
    }
    inspector.refresh();
  }

  // Layout -------------------------------------------------------------------------
  const el = h("section", { class: "view", id: "view-discover", "aria-labelledby": "discover-title" },
    h("div", { class: "view-head" },
      h("h1", { id: "discover-title", class: "view-title", text: "Discover" }),
      h("p", { class: "tagline", text: "Find cards, see what they do, and brew with them." })),
    h("section", { class: "panel-box search-box", "aria-label": "Search" },
      h("div", { class: "search-top" },
        h("div", { class: "preset-row" },
          field("Preset", presetSelect),
          h("div", { class: "row wrap" }, applyBtn, saveBtn, renameBtn, deleteBtn)),
        filtersToggle),
      presetSlot,
      chipList,
      filtersPanel,
      previewNotes,
      h("div", { class: "pool-line" }, poolLine, openLink),
      h("div", { class: "mode-row" },
        h("div", { class: "segmented", role: "group", "aria-label": "How to see cards" }, modeDraw, modeBrowse),
        drawControls,
        browseControls,
        cancelBtn),
      progress,
      drawNotes),
    h("div", { class: "results-layout" },
      h("section", { class: "results-col", "aria-label": "Results" },
        browseStatus,
        results,
        loadMoreBtn),
      inspector.el),
    h("details", { class: "panel-box history-box" },
      h("summary", {}, h("span", { class: "h2", text: "Recent draws" }), historyCount),
      h("div", { class: "row space" }, h("p", { class: "hint", text: "The last 100 cards you drew." }), clearBtn),
      historySlot,
      historyList));

  form.set(normalizeCriteria(app.settings.lastCriteria));
  current = buildQuery(form.get());
  renderPresets(BUILT_IN_PRESET.id);
  renderPreview();
  renderHistory();
  setSort(sort, { quiet: true });
  setMode(mode, false);
  if (mode === "browse") replace(browseStatus, "Choose a sort, then select Show cards.");
  schedulePool();

  return {
    el,
    refresh() {
      renderPresets();
      renderHistory();
    },
    refreshSaved,
    /**
     * Loads criteria from elsewhere in the app, for example an Explore
     * search, and explains where they came from.
     * @param {import("../query.js").Criteria} criteria
     * @param {string} note
     * @param {{mode?: "draw"|"browse", sort?: {order: string, dir: string}}} [opts]
     */
    load(criteria, note, opts = {}) {
      cancelAll();
      form.set(criteria);
      onCriteria(form.get());
      results.replaceChildren();
      browse = emptyBrowse("");
      replace(drawNotes, message("info", note));
      if (opts.mode) setMode(opts.mode, false);
      if (opts.sort) setSort(opts.sort, { quiet: true, persist: false });
      app.saveSettings({ discoverMode: mode }, { quiet: true });
      if (mode === "browse") {
        loadPage(true);
        browseStatus.focus();
      } else {
        drawBtn.focus();
      }
      announce(`${note} ${mode === "browse" ? "Loading cards." : "Select Draw to see cards."}`);
    },
  };
}
