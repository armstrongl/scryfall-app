// Starts the app and switches between views.

import { APP_NAME, FAN_CONTENT_NOTICE, SCRYFALL_SITE } from "./config.js";
import { createClient } from "./scryfall.js";
import { openStorage, persistenceStatus, requestPersistence } from "./storage/index.js";
import { defaultSettings } from "./export.js";
import { createDiscoverView } from "./ui/discover.js";
import { createListsView } from "./ui/lists-view.js";
import { createDataView } from "./ui/data-view.js";
import { createHelpView } from "./ui/help-view.js";
import { TIPS } from "./docs.js";
import { announce, h, message, replace, wireTip } from "./ui/dom.js";
import { savedIndex, savedIn } from "./saved.js";

/**
 * Shared app state. Views read the cached data here and change it only
 * through these methods, which save through the storage interface.
 * @typedef {Awaited<ReturnType<typeof createApp>>} App
 */

async function createApp() {
  const { storage, error } = await openStorage();
  const listeners = new Set();

  const app = {
    storage,
    storageOk: !error,
    storageError: error ? String(error.message ?? error) : null,
    persistence: "unknown",
    persistRequested: false,
    client: createClient({ onPauseChange: (until) => showPause(until) }),
    /** @type {import("./lists.js").CardList[]} */
    lists: [],
    /** @type {import("./export.js").Preset[]} */
    presets: [],
    /** @type {import("./export.js").HistoryItem[]} */
    history: [],
    /** @type {import("./export.js").Settings} */
    settings: defaultSettings(),
    /**
     * Opens Discover with the given criteria and a note. Set in start(),
     * after the views exist. With `{mode: "browse"}`, Discover lists every
     * match at once.
     * @type {(criteria: import("./query.js").Criteria, note: string, opts?: {mode?: "draw"|"browse", sort?: {order: string, dir: string}}) => void}
     */
    showInDiscover: () => {},
    /** Saved cards by card key. Rebuilt when lists change. */
    saved: new Map(),
    /** The lists that hold a card. @param {import("./cards.js").CardSnapshot} snapshot */
    savedIn(snapshot) {
      return savedIn(app.saved, snapshot);
    },

    onChange(fn) {
      listeners.add(fn);
    },
    emit(what) {
      for (const fn of listeners) fn(what);
    },

    /**
     * Shows a short status message and announces it. An action adds a
     * button, such as Undo, and keeps the message up longer.
     * @param {string} text
     * @param {"ok"|"info"|"warn"|"error"} [kind]
     * @param {{label: string, run: () => void}} [action]
     */
    notify(text, kind = "ok", action) {
      const slot = document.getElementById("toast");
      if (slot) {
        const msg = message(kind, text);
        if (action) {
          msg.append(" ", h("button", {
            type: "button",
            class: "toast-action",
            text: action.label,
            onclick: () => {
              slot.replaceChildren();
              action.run();
            },
          }));
        }
        replace(slot, msg);
        clearTimeout(app._toastTimer);
        app._toastTimer = setTimeout(() => slot.replaceChildren(), action ? 12000 : 6000);
      }
      announce(action ? `${text} ${action.label} is available.` : text);
    },

    /** Runs a storage call. On failure, tells the user and returns false. */
    async guard(fn, failText) {
      try {
        await fn();
        return true;
      } catch (e) {
        app.notify(`${failText} ${e?.message ?? ""}`.trim(), "error");
        return false;
      }
    },

    async afterSave() {
      if (app.persistRequested || !app.storageOk) return;
      app.persistRequested = true;
      app.persistence = await requestPersistence();
      app.emit("settings");
    },

    async reload() {
      const [lists, presets, history, settings] = await Promise.all([
        storage.getLists(), storage.getPresets(), storage.getHistory(), storage.getSettings(),
      ]);
      Object.assign(app, { lists, presets, history, settings, saved: savedIndex(lists) });
      app.emit("all");
    },

    async saveList(list) {
      const ok = await app.guard(async () => {
        await storage.saveList(list);
        const saved = (await storage.getList(list.id)) ?? list;
        app.lists = [...app.lists.filter((l) => l.id !== list.id), saved];
        app.saved = savedIndex(app.lists);
        app.settings = await storage.getSettings();
      }, "The list was not saved.");
      if (ok) {
        app.afterSave();
        app.emit("lists");
      }
      return ok;
    },
    async deleteList(id) {
      const ok = await app.guard(async () => {
        await storage.deleteList(id);
        app.lists = app.lists.filter((l) => l.id !== id);
        app.saved = savedIndex(app.lists);
        app.settings = await storage.getSettings();
      }, "The list was not deleted.");
      if (ok) app.emit("lists");
      return ok;
    },
    async savePreset(preset) {
      const ok = await app.guard(async () => {
        await storage.savePreset(preset);
        app.presets = await storage.getPresets();
        app.settings = await storage.getSettings();
      }, "The preset was not saved.");
      if (ok) {
        app.afterSave();
        app.emit("presets");
      }
      return ok;
    },
    async deletePreset(id) {
      const ok = await app.guard(async () => {
        await storage.deletePreset(id);
        app.presets = app.presets.filter((p) => p.id !== id);
        app.settings = await storage.getSettings();
      }, "The preset was not deleted.");
      if (ok) app.emit("presets");
      return ok;
    },
    async addHistory(item) {
      app.history = [item, ...app.history].slice(0, 100);
      try {
        await storage.addHistory(item);
      } catch {
        // History is a convenience. Discovery keeps working without it.
      }
    },
    async clearHistory() {
      return app.guard(async () => {
        await storage.clearHistory();
        app.history = [];
      }, "The history was not cleared.");
    },
    /**
     * Merges changes into the settings and saves them.
     * @param {Partial<import("./export.js").Settings>} changes
     * @param {{quiet?: boolean}} [opts] quiet: do not re-render views.
     */
    async saveSettings(changes, opts = {}) {
      app.settings = { ...app.settings, ...changes };
      try {
        await storage.saveSettings(app.settings);
      } catch {
        // Settings are a convenience. Discovery keeps working without them.
      }
      if (!opts.quiet) app.emit("settings");
    },
  };

  try {
    await app.reload();
  } catch (e) {
    app.storageOk = false;
    app.storageError = String(e?.message ?? e);
  }
  app.persistence = await persistenceStatus();
  return app;
}

// Rate-limit pause banner -------------------------------------------------------
let pauseTimer = null;
function showPause(until) {
  const banner = document.getElementById("pause");
  if (!banner) return;
  clearInterval(pauseTimer);
  if (!until) {
    banner.hidden = true;
    announce("Requests to Scryfall started again.");
    return;
  }
  const tick = () => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    banner.textContent = `Scryfall paused requests. The app tries again in ${left} seconds.`;
    if (left <= 0) {
      clearInterval(pauseTimer);
      banner.hidden = true;
    }
  };
  banner.hidden = false;
  tick();
  announce(`Scryfall paused requests. The app tries again in ${Math.ceil((until - Date.now()) / 1000)} seconds.`);
  pauseTimer = setInterval(tick, 1000);
}

// Nerd mode tooltip -------------------------------------------------------------
/**
 * The tooltip is in index.html. It works like every other tooltip
 * (wireTip in src/ui/dom.js): hover and keyboard focus show it, and Escape
 * hides it.
 * @param {HTMLElement|null} button
 */
function setUpTooltip(button) {
  const wrap = button?.closest(".tip-wrap");
  const tip = document.getElementById(button?.getAttribute("aria-describedby") ?? "");
  if (!wrap || !tip || !button) return;
  tip.textContent = TIPS.nerdMode;
  wireTip(wrap, button, tip);
}

// Views and navigation -----------------------------------------------------------
function parseHash() {
  const [view, id] = location.hash.replace(/^#/, "").split("/");
  if (view === "lists") return { view: "lists", id: id ?? null };
  if (view === "data") return { view: "data", id: null };
  if (view === "help") return { view: "help", id: id ?? null };
  return { view: "discover", id: null };
}

async function start() {
  document.title = APP_NAME;
  for (const el of document.querySelectorAll("[data-app-name]")) el.textContent = APP_NAME;
  const notice = document.getElementById("fan-notice");
  if (notice) notice.textContent = FAN_CONTENT_NOTICE;
  const scryfallLink = document.getElementById("scryfall-link");
  if (scryfallLink) scryfallLink.href = SCRYFALL_SITE;

  const main = document.getElementById("main");
  const app = await createApp();
  if (!app.storageOk) {
    document.getElementById("toast")?.append(message("warn", "Storage is not available in this browser window. Discovery works, but lists can't be saved."));
  }

  const views = {
    discover: createDiscoverView(app),
    lists: createListsView(app),
    data: createDataView(app),
    help: createHelpView(),
  };
  replace(main, views.discover.el, views.lists.el, views.data.el, views.help.el);

  /** Opens Discover with the given criteria, for example an Explore search. */
  app.showInDiscover = (criteria, note, opts = {}) => {
    if (parseHash().view !== "discover") {
      // pushState doesn't fire hashchange, so route here. Discover then
      // moves focus itself instead of to the view title.
      history.pushState(null, "", "#discover");
      route(false);
    }
    views.discover.load(criteria, note, opts);
  };

  // Nerd mode.
  const densityBtn = document.getElementById("density-toggle");
  const applyDensity = () => {
    const nerd = app.settings.density === "nerd";
    document.documentElement.dataset.density = nerd ? "nerd" : "comfortable";
    densityBtn?.setAttribute("aria-pressed", String(nerd));
  };
  applyDensity();
  setUpTooltip(densityBtn);
  densityBtn?.addEventListener("click", () => {
    const nerd = app.settings.density !== "nerd";
    app.saveSettings({ density: nerd ? "nerd" : "comfortable" }, { quiet: true });
    applyDensity();
    announce(nerd ? "Nerd mode is on. Cards show more details." : "Nerd mode is off.");
  });

  let active = null;
  function route(focus) {
    const { view, id } = parseHash();
    for (const [name, v] of Object.entries(views)) v.el.hidden = name !== view;
    for (const link of document.querySelectorAll("nav a[data-view]")) {
      if (link.dataset.view === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (view === "lists") views.lists.show(id);
    if (view === "data") views.data.show();
    const changed = active !== `${view}/${id}`;
    const sameView = active?.split("/")[0] === view;
    active = `${view}/${id}`;
    if (view === "help") {
      // Moving between Help pages puts focus on the new page's heading.
      views.help.show(id, { focus: focus && changed && sameView });
      if (sameView) return;
    }
    if (focus && changed) {
      const title = views[view].el.querySelector("h1");
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
    }
  }

  app.onChange((what) => {
    const { view } = parseHash();
    if (what === "all") views.discover.refresh();
    if (what === "presets") views.discover.refresh();
    if (what === "lists" || what === "all") views.discover.refreshSaved();
    if (view === "lists" && what !== "presets") views.lists.refresh();
    if (view === "data") views.data.refresh();
  });

  window.addEventListener("hashchange", () => route(true));
  route(false);
}

start().catch((e) => {
  const main = document.getElementById("main");
  if (main) {
    replace(main, h("p", { class: "msg msg-error", role: "alert", text: `The app did not start. Reload the page. (${e?.message ?? e})` }));
  }
});
