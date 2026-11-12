// GitHub sync: the sync file, the merge, and the text for sync errors.
// Pure module. The GitHub client is src/github.js, and the sync cycle is
// src/storage/sync.js.

import { APP_ID, APP_NAME, DELETION_KEEP_DAYS, GITHUB_BACKUP_DIR, SYNCED_SETTINGS } from "./config.js";
import { cleanSettings, makeBackup, mergeData, validateBackup } from "./export.js";

/**
 * @typedef {import("./export.js").AppData} AppData
 * @typedef {import("./export.js").Backup} Backup
 */

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The sync file: a schema 3 backup with no history and only the synced
 * settings. Items are sorted by ID, so that the same data always gives the
 * same file. It imports like any other backup.
 * @param {AppData} data
 * @param {string} now
 * @returns {Backup}
 */
export function syncFileFrom(data, now) {
  const settings = cleanSettings(Object.fromEntries(
    [...SYNCED_SETTINGS, "syncSettingsAt"].map((k) => [k, data.settings[k]]),
  ));
  return makeBackup({
    lists: [...data.lists].sort(byId),
    presets: [...data.presets].sort(byId),
    history: [],
    settings,
    deletions: [...(data.deletions ?? [])].sort(byId),
  }, now);
}

/** @param {Backup} file */
export function syncFileText(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** True when two sync files hold the same data. The export date doesn't count. */
export function sameSyncData(a, b) {
  return syncFileText({ ...a, exportedAt: "" }) === syncFileText({ ...b, exportedAt: "" });
}

/**
 * Reads the text of the sync file.
 * @param {string} text
 * @returns {{ok: true, file: Backup} | {ok: false}}
 */
export function parseSyncFile(text) {
  try {
    const r = validateBackup(JSON.parse(text));
    return r.ok ? { ok: true, file: r.backup } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Merges this device's data with the sync file. Lists and presets merge as
 * a backup import does, with deletion markers. History stays on the device.
 * The synced settings come from the side that changed them last. Markers
 * older than DELETION_KEEP_DAYS are removed.
 * @param {AppData} local
 * @param {Backup} remote
 * @param {string} now
 * @returns {AppData}
 */
export function mergeForSync(local, remote, now) {
  const merged = mergeData({ ...local, deletions: local.deletions ?? [] }, remote);
  const theirs = cleanSettings(remote.settings);
  const settings = (theirs.syncSettingsAt ?? "") > (local.settings.syncSettingsAt ?? "")
    ? { ...local.settings, ...Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, theirs[k]])), syncSettingsAt: theirs.syncSettingsAt }
    : local.settings;
  const oldest = new Date(Date.parse(now) - DELETION_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return {
    lists: merged.lists,
    presets: merged.presets,
    deletions: merged.deletions.filter((d) => d.deletedAt >= oldest),
    history: local.history,
    settings,
  };
}

/**
 * Where a backup exported to GitHub goes: the backups folder, with the date
 * and time in the name, so that each export is a new file.
 * @param {string} isoDate
 */
export function githubBackupPath(isoDate) {
  const time = isoDate.slice(11, 19).replace(/:/g, "");
  return `${GITHUB_BACKUP_DIR}/${APP_ID}-backup-${isoDate.slice(0, 10)}-${time}.json`;
}

const BACKUP_NAME = new RegExp(`^${APP_ID}-backup-(\\d{4}-\\d{2}-\\d{2})-(\\d{2})(\\d{2})(\\d{2})\\.json$`);

/**
 * The time in the name of a backup from Export to GitHub, as an ISO date,
 * or null for any other name.
 * @param {string} name
 */
export function backupTime(name) {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  const t = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * The JSON files in a folder listing from GitHub. Backups from Export to
 * GitHub come first, newest first, then any other JSON files by name.
 * @param {Array<{name: string, path: string, type: string}>} listing
 * @returns {Array<{name: string, path: string, time: string|null}>}
 */
export function backupFiles(listing) {
  return listing
    .filter((f) => f.type === "file" && /\.json$/i.test(f.name))
    .map((f) => ({ name: f.name, path: f.path, time: backupTime(f.name) }))
    .sort((a, b) => {
      if (a.time && b.time) return a.time < b.time ? 1 : a.time > b.time ? -1 : 0;
      if (a.time || b.time) return a.time ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Reads a repository from "account/name" or a GitHub link.
 * @param {string} input
 * @returns {{owner: string, repo: string} | null}
 */
export function parseRepo(input) {
  const path = String(input ?? "").trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\/$/, "")
    .replace(/\.git$/i, "");
  const parts = path.split("/");
  if (parts.length !== 2 || !parts.every((p) => NAME.test(p))) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * A link to GitHub's page for a new fine-grained token, with the name, the
 * account, and Contents read and write filled in. The repository is chosen on
 * that page. See
 * https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
 * @param {string} account The GitHub account that has the repository.
 */
export function tokenUrl(account) {
  const u = new URL("https://github.com/settings/personal-access-tokens/new");
  u.searchParams.set("name", `${APP_NAME} sync`.slice(0, 40));
  u.searchParams.set("description", `Lets ${APP_NAME} keep your lists in one private repository.`);
  if (account) u.searchParams.set("target_name", account);
  u.searchParams.set("expires_in", "366");
  u.searchParams.set("contents", "write");
  return u.toString();
}

const ERRORS = {
  unauthorized: "GitHub refused the token. It may have expired or been deleted. Disconnect, then connect with a new token.",
  forbidden: "The token can't change this repository. Give the token access to the repository, with Contents set to read and write.",
  "not-found": "GitHub can't find the repository, or the token has no access to it. Check the name and the token's repository access.",
  "public-repo": "The repository is public, so anyone could read your lists. Choose a private repository.",
  conflict: "Another device kept changing the sync file. Sync again in a moment.",
  "rate-limited": "GitHub asked the app to slow down. The app syncs again later.",
  network: "The app can't reach GitHub. Check your connection. Your changes are kept on this device and sync later.",
  server: "GitHub had a problem. The app syncs again later.",
  "backup-exists": "A backup with the same time is already on GitHub. Wait a second, then select Export to GitHub again.",
  "backup-missing": "That backup isn't on GitHub anymore. Select Choose a backup on GitHub again.",
  "bad-file": "The sync file on GitHub isn't a file from this app, so the app didn't change it. Check the file in the repository.",
};

/** Plain text for a sync error code. */
export function syncErrorText(code) {
  return ERRORS[code] ?? ERRORS.server;
}
