// The Data view: backup, import, storage status, and attribution.

import { APP_NAME, BACKUP_REMINDER_DAYS, FAN_CONTENT_NOTICE, SCRYFALL_SITE } from "../config.js";
import { backupFileName, needsBackupReminder, validateBackup } from "../export.js";
import { TIPS } from "../docs.js";
import { announce, confirmBox, field, formatDate, h, helpLink, infoTip, message, plural, replace } from "./dom.js";

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

  async function readFile(file) {
    pending = null;
    if (!file) return replace(importSlot);
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
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
            ? "Replace all of your data with the data in this file? You can't undo this."
            : "Merge this file into your data? Items with the same ID keep the newer copy.",
          confirmLabel: mode === "replace" ? "Replace all data" : "Merge",
          onConfirm: async () => {
            try {
              await app.storage.importAll(pending, mode);
              await app.reload();
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
      h("section", { class: "panel-box", "aria-labelledby": "backup-title" },
        h("h2", { id: "backup-title", text: "Backup" }),
        reminder ? message("warn", "Your data changed since your last backup. Export a backup now.") : null,
        h("p", { text: "A backup file has all of your lists, custom presets, history, and settings." }),
        h("button", { type: "button", class: "primary", text: "Export backup", onclick: exportBackup })),
      h("section", { class: "panel-box", "aria-labelledby": "import-title" },
        h("h2", { id: "import-title", text: "Import backup" }),
        field("Backup file", fileInput),
        importSlot),
      h("section", { class: "panel-box", "aria-labelledby": "about-title" },
        h("h2", { id: "about-title", text: "About" }),
        h("p", {}, `${APP_NAME} helps you discover Magic: The Gathering cards, learn what they do, see how they work together, find combos, and build Standard and Brawl decks for MTG Arena. To learn how, open `, h("a", { href: "#help", text: "Help" }), ". ",
          "Card data and images come from ", h("a", { href: SCRYFALL_SITE, text: "Scryfall" }), ". The app is not made by or endorsed by Scryfall."),
        h("p", { text: FAN_CONTENT_NOTICE })));
  }

  return { el, show: render, refresh: render };
}
