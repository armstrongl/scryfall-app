// The Data view: storage status, GitHub sync, backup, import, and attribution.

import { APP_NAME, BACKUP_REMINDER_DAYS, FAN_CONTENT_NOTICE, GITHUB_BACKUP_DIR, SCRYFALL_SITE } from "../config.js";
import { backupFileName, needsBackupReminder, validateBackup } from "../export.js";
import { TIPS } from "../docs.js";
import { parseRepo, syncErrorText, tokenUrl } from "../sync.js";
import { announce, confirmBox, field, formatDate, h, helpLink, infoTip, message, plural, replace } from "./dom.js";

/** A link that opens another site in a new tab, and says so to screen readers. */
const outLink = (href, text, attrs = {}) =>
  h("a", { href, target: "_blank", rel: "noopener", ...attrs }, text, h("span", { class: "visually-hidden", text: " (opens in a new tab)" }));

const PERSISTENCE_TEXT = {
  persistent: "Storage: persistent",
  "best-effort": "Storage: the browser can clear it",
  unknown: "Storage: the browser can clear it (this browser does not report persistence)",
};

/** @param {import("../main.js").App} app */
export function createDataView(app) {
  const el = h("section", { class: "view", id: "view-data", "aria-labelledby": "data-title" });
  const importSlot = h("div");
  let pending = null; // A validated backup that waits for the user's choice.
  let githubBusy = false; // An export to GitHub is running.
  let readSeq = 0; // Each read of a backup gets a number, so that a late reply can't replace a newer one.
  let slotRepo = null; // The repository whose backup list importSlot shows, if any.

  // Sync with GitHub. The fields stay across re-renders, so typed text stays.
  const repoInput = h("input", {
    id: "sync-repo", type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false",
    placeholder: "your-name/cascade-data",
    oninput: () => { tokenLink.href = tokenUrl(parseRepo(repoInput.value)?.owner ?? ""); },
  });
  const tokenInput = h("input", { id: "sync-token", type: "password", autocomplete: "off", autocapitalize: "none", spellcheck: "false" });
  const tokenLink = outLink(tokenUrl(""), "Create a token");
  const syncSlot = h("div", { class: "sync-message" });
  const syncConfirm = h("div");
  /** The control to focus after the next render, by ID. */
  let focusNext = null;

  function syncError(text, focusEl) {
    replace(syncSlot, message("error", text));
    focusEl?.focus();
  }

  async function connect() {
    const parsed = parseRepo(repoInput.value);
    if (!parsed) return syncError("Enter the repository as account/name, for example your-name/cascade-data.", repoInput);
    const token = tokenInput.value.trim();
    if (!token) return syncError("Paste the token from GitHub into Token.", tokenInput);
    const btn = el.querySelector("#sync-connect");
    if (btn) btn.disabled = true;
    replace(syncSlot, message("info", "Connecting to GitHub…"));
    announce("Connecting to GitHub.");
    const result = await app.connectSync({ ...parsed, token });
    if (!result.ok) {
      if (btn) btn.disabled = false;
      syncError(syncErrorText(result.error));
      return;
    }
    tokenInput.value = "";
    syncSlot.replaceChildren();
    focusNext = "sync-now";
    render();
    announce(`Connected to ${parsed.owner}/${parsed.repo} and synced.`);
  }

  async function syncNow() {
    if (app.syncing) return;
    const result = await app.runSync({ manual: true });
    if (!result) return;
    if (result.ok) app.notify(result.changedLocal ? "Synced. Changes from GitHub are now on this device." : "Synced. Everything was up to date.");
    else app.notify(syncErrorText(result.error), "error");
  }

  function disconnect() {
    replace(syncConfirm, confirmBox({
      message: "Disconnect from GitHub? The app deletes the token from this browser. Your data stays on this device and in the repository.",
      confirmLabel: "Disconnect",
      onConfirm: async () => {
        await app.disconnectSync();
        syncConfirm.replaceChildren();
        focusNext = "sync-repo";
        render();
        announce("Disconnected from GitHub.");
      },
      onCancel: () => {
        syncConfirm.replaceChildren();
        el.querySelector("#sync-disconnect")?.focus();
      },
    }));
  }

  function syncSection() {
    const box = h("section", { class: "panel-box", id: "sync-section", "aria-labelledby": "sync-title" },
      h("h2", { id: "sync-title", text: "Sync with GitHub" }));
    if (!app.storageOk) {
      box.append(message("warn", "Sync needs storage, which isn't available in this browser window."));
      return box;
    }
    const state = app.syncState;
    if (!state) {
      box.append(
        h("p", { text: "Keep your lists, custom presets, and settings in a private GitHub repository, and use them on each device that you connect. History stays on each device." }),
        h("ol", { class: "steps" },
          h("li", {}, outLink("https://github.com/new", "Create a repository"), " on GitHub. Make it private."),
          h("li", {}, "Enter the repository below. Then ", tokenLink, ": under Repository access, choose only that repository, then generate the token."),
          h("li", { text: "Paste the token below, then select Connect." })),
        field("Repository", repoInput, "Account and name, for example your-name/cascade-data."),
        field("Token", tokenInput, undefined, TIPS.syncToken),
        h("div", { class: "row wrap" }, h("button", { type: "button", id: "sync-connect", text: "Connect", onclick: connect })),
        syncSlot,
        h("p", { class: "hint" }, helpLink("sync", "Learn more about sync")));
      return box;
    }
    const name = `${state.owner}/${state.repo}`;
    box.append(
      h("p", {}, "Syncing with ", outLink(`https://github.com/${state.owner}/${state.repo}`, name), "."),
      app.syncing
        ? h("p", { class: "hint", text: "Syncing…" })
        : state.lastError ? message("warn", syncErrorText(state.lastError)) : null,
      h("p", { class: "hint", text: `Last sync: ${formatDate(state.lastSyncAt)}.` }),
      h("div", { class: "row wrap" },
        // aria-disabled, not disabled, so that focus stays on the button during a sync.
        h("button", { type: "button", id: "sync-now", text: "Sync now", "aria-disabled": app.syncing ? "true" : null, onclick: syncNow }),
        h("button", { type: "button", id: "sync-disconnect", text: "Disconnect", onclick: disconnect })),
      syncConfirm,
      h("p", { class: "hint" }, helpLink("sync", "Learn more about sync")));
    return box;
  }

  async function exportBackup() {
    try {
      const backup = await app.storage.exportAll();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = h("a", { href: url, download: backupFileName(backup.exportedAt) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      await app.saveSettings({ lastBackupAt: backup.exportedAt });
      app.notify(`Exported ${backupFileName(backup.exportedAt)}.`);
    } catch (e) {
      app.notify(`The backup was not exported. ${e.message ?? ""}`.trim(), "error");
    }
  }

  /** Exports a full backup to the backups folder of the sync repository. */
  async function exportToGitHub() {
    if (githubBusy) return;
    githubBusy = true;
    const btn = el.querySelector("#backup-github");
    btn?.setAttribute("aria-disabled", "true");
    announce("Exporting a backup to GitHub.");
    try {
      const r = await app.exportBackupToGitHub();
      if (!r.ok) return app.notify(`The backup was not exported to GitHub. ${syncErrorText(r.error)}`, "error");
      await app.saveSettings({ lastBackupAt: r.exportedAt });
      app.notify(`Exported ${r.path} to GitHub.`);
    } finally {
      githubBusy = false;
      el.querySelector("#backup-github")?.removeAttribute("aria-disabled");
    }
  }

  /** Shows the backups in the sync repository, to choose one to import. */
  async function listGitHubBackups() {
    pending = null;
    const seq = ++readSeq;
    const state = app.syncState;
    const repoName = `${state?.owner}/${state?.repo}`;
    slotRepo = repoName;
    replace(importSlot, message("info", "Reading the backups on GitHub…"));
    const r = await app.listGitHubBackups();
    if (seq !== readSeq) return;
    if (!r.ok) return githubReadError(r.error, "The backups on GitHub can't be read.");
    if (!r.files.length) {
      replace(importSlot, message("info", `There are no backups in the ${GITHUB_BACKUP_DIR} folder of ${repoName} yet. To make one, select Export to GitHub.`));
      announce("There are no backups on GitHub yet.");
      return;
    }
    const select = h("select", { id: "import-github-file" },
      r.files.map((f) => h("option", { value: f.path, text: f.time ? formatDate(f.time) : f.name })));
    replace(importSlot,
      field("Backup on GitHub", select, `Newest first, from the ${GITHUB_BACKUP_DIR} folder of the repository.`),
      h("div", { class: "row wrap" }, h("button", { type: "button", id: "import-github-open", text: "Open backup", onclick: () => openGitHubBackup(select.value) })));
    select.focus();
    announce(`${plural(r.files.length, "backup")} on GitHub.`);
  }

  async function openGitHubBackup(path) {
    const seq = ++readSeq;
    replace(importSlot, message("info", "Reading the backup from GitHub…"));
    const r = await app.readGitHubBackup(path);
    if (seq !== readSeq) return;
    if (!r.ok) return githubReadError(r.error, "The backup can't be read from GitHub.");
    slotRepo = null;
    readText(r.text);
  }

  /** Shows a GitHub error in the import section, and puts focus where the user can try again. */
  function githubReadError(code, spoken) {
    replace(importSlot, message("error", syncErrorText(code)));
    el.querySelector("#import-github-list")?.focus();
    announce(spoken);
  }

  async function readFile(file) {
    pending = null;
    const seq = ++readSeq;
    slotRepo = null;
    if (!file) return replace(importSlot);
    const text = await file.text();
    if (seq === readSeq) readText(text);
  }

  /** Checks a backup's text and shows the import choices, or the errors. */
  function readText(text) {
    pending = null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      replace(importSlot, message("error", "The file is not valid JSON. Choose a backup file from this app."));
      return;
    }
    const r = validateBackup(parsed);
    if (!r.ok) {
      replace(importSlot,
        message("error", "The file can't be imported. No data changed."),
        h("ul", { class: "errors" }, r.errors.map((e) => h("li", { text: e }))));
      announce("The file can't be imported.");
      return;
    }
    pending = r.backup;
    const merge = h("input", { type: "radio", name: "import-mode", value: "merge", checked: true, id: "mode-merge" });
    const repl = h("input", { type: "radio", name: "import-mode", value: "replace", id: "mode-replace" });
    const confirmSlot = h("div");
    const go = h("button", {
      type: "button",
      class: "primary",
      text: "Import",
      onclick: () => {
        const mode = repl.checked ? "replace" : "merge";
        replace(confirmSlot, confirmBox({
          message: mode === "replace"
            ? app.syncState
              ? "Replace all of your data with the data in this file? You can't undo this. Your synced devices get the same data at their next sync."
              : "Replace all of your data with the data in this file? You can't undo this."
            : "Merge this file into your data? Items with the same ID keep the newer copy.",
          confirmLabel: mode === "replace" ? "Replace all data" : "Merge",
          onConfirm: async () => {
            try {
              await app.storage.importAll(pending, mode);
              await app.reload();
              app.scheduleSync();
              pending = null;
              replace(importSlot, message("ok", mode === "replace" ? "Replaced your data with the backup." : "Merged the backup into your data."));
              announce("Import done.");
            } catch (e) {
              replace(confirmSlot, message("error", `The import did not finish. ${e.message ?? ""}`.trim()));
            }
          },
          onCancel: () => { confirmSlot.replaceChildren(); go.focus(); },
        }));
      },
    });
    replace(importSlot,
      h("p", {}, `This backup is from ${formatDate(pending.exportedAt)}. It has ${plural(r.counts.lists, "list")}, ${plural(r.counts.presets, "preset")}, and ${plural(r.counts.history, "history item")}.`),
      h("fieldset", { class: "checks" },
        h("legend", { text: "How to import" }),
        h("label", { class: "check", for: "mode-merge" }, merge, h("span", { text: "Merge: add new items and keep the newer copy of each item" })),
        h("label", { class: "check", for: "mode-replace" }, repl, h("span", { text: "Replace: remove all current data, then add the file's data" }))),
      go,
      confirmSlot);
    go.focus();
  }

  function render() {
    // Keep focus on the same control when the view re-renders, such as Sync now during a sync.
    const focusedId = focusNext ?? (el.contains(document.activeElement) ? document.activeElement?.id : null);
    focusNext = null;
    // A backup list from GitHub belongs to one connection. Drop it when that changes.
    const repoNow = app.syncState ? `${app.syncState.owner}/${app.syncState.repo}` : null;
    if (slotRepo && slotRepo !== repoNow) {
      slotRepo = null;
      readSeq++;
      importSlot.replaceChildren();
    }
    const fileInput = h("input", { type: "file", accept: "application/json,.json", onchange: () => readFile(fileInput.files?.[0]) });
    const reminder = needsBackupReminder(app.settings, Date.now(), BACKUP_REMINDER_DAYS);
    replace(el,
      h("h1", { id: "data-title", class: "view-title", text: "Data" }),
      h("section", { class: "panel-box", "aria-labelledby": "storage-title" },
        h("h2", { id: "storage-title", text: "Storage" }),
        app.storageOk
          ? h("p", {}, PERSISTENCE_TEXT[app.persistence] ?? PERSISTENCE_TEXT.unknown, " ", infoTip("Storage", TIPS.storage))
          : message("warn", `Storage is not available, so lists, presets, and history are lost when you close the page. Discovery still works. ${app.storageError ?? ""}`.trim()),
        h("p", { class: "hint", text: `Last backup: ${formatDate(app.settings.lastBackupAt)}.` }),
        h("p", { class: "hint", text: "On iPhone and iPad, Safari deletes this app's data if you don't open it for 7 days of Safari use. To prevent this, add the app to your Home Screen: in Safari, select Share, then Add to Home Screen. Open the app from the Home Screen icon." }),
        h("p", { class: "hint" }, helpLink("your-data", "Learn more about where your data is stored"))),
      syncSection(),
      h("section", { class: "panel-box", "aria-labelledby": "backup-title" },
        h("h2", { id: "backup-title", text: "Backup" }),
        reminder ? message("warn", "Your data changed since your last backup. Export a backup now.") : null,
        h("p", { text: "A backup file has all of your lists, custom presets, history, and settings." }),
        app.syncState ? h("p", { class: "hint", text: `Export to GitHub puts a new backup file in the ${GITHUB_BACKUP_DIR} folder of ${app.syncState.owner}/${app.syncState.repo}.` }) : null,
        h("div", { class: "row wrap" },
          h("button", { type: "button", class: "primary", text: "Export backup", onclick: exportBackup }),
          app.syncState
            ? h("button", { type: "button", id: "backup-github", text: "Export to GitHub", "aria-disabled": githubBusy ? "true" : null, onclick: exportToGitHub })
            : null)),
      h("section", { class: "panel-box", "aria-labelledby": "import-title" },
        h("h2", { id: "import-title", text: "Import backup" }),
        field("Backup file", fileInput),
        app.syncState
          ? h("div", { class: "row wrap" }, h("button", { type: "button", id: "import-github-list", text: "Choose a backup on GitHub", onclick: listGitHubBackups }))
          : null,
        importSlot),
      h("section", { class: "panel-box", "aria-labelledby": "about-title" },
        h("h2", { id: "about-title", text: "About" }),
        h("p", {}, `${APP_NAME} helps you discover Magic: The Gathering cards, learn what they do, see how they work together, find combos, and build Standard and Brawl decks for MTG Arena. To learn how, open `, h("a", { href: "#help", text: "Help" }), ". ",
          "Card data and images come from ", h("a", { href: SCRYFALL_SITE, text: "Scryfall" }), ". The app is not made by or endorsed by Scryfall."),
        h("p", { text: FAN_CONTENT_NOTICE })));
    if (focusedId) el.querySelector(`#${CSS.escape(focusedId)}`)?.focus();
  }

  return { el, show: render, refresh: render };
}
