// The sync cycle: pull, merge, push. Uses the Storage interface and a
// GitHub client, both passed in, so the tests run it with memory storage
// and a fake GitHub.

import { APP_NAME, SYNC_FILE_NAME, SYNC_MAX_TRIES } from "../config.js";
import { defaultClock } from "../lists.js";
import { mergeForSync, parseSyncFile, sameSyncData, syncFileFrom, syncFileText } from "../sync.js";

/**
 * @typedef {{ok: true, changedLocal: boolean} | {ok: false, error: string}} SyncResult
 */

/** Errors that mean the connection can't work until someone fixes it. */
const FATAL = ["unauthorized", "forbidden", "not-found"];

/** The parts of local data that a sync reads and writes. */
const syncedPart = (d) => JSON.stringify([d.lists, d.presets, d.deletions ?? [], d.settings]);

/**
 * @param {{
 *   storage: ReturnType<typeof import("./index.js").createStorage>,
 *   makeClient: (token: string) => ReturnType<typeof import("../github.js").createGitHub>,
 *   clock?: {now: () => string},
 *   onLocalChange?: () => (void|Promise<void>),
 * }} deps
 *   onLocalChange runs as soon as a sync has changed data on the device,
 *   before the write to GitHub, so that the app shows and edits the new data.
 */
export function createSyncer({ storage, makeClient, clock = defaultClock, onLocalChange = () => {} }) {
  /** @type {Promise<SyncResult>|null} */
  let running = null;
  /** @type {Promise<SyncResult>|null} */
  let queued = null;

  const codeOf = (e) => (e?.name === "GitHubError" ? e.code : "server");
  const same = (a, b) => !!a && !!b && a.owner === b.owner && a.repo === b.repo && a.token === b.token;

  /**
   * Updates the connection, but only if it is still the one this sync
   * started with. A Disconnect or a new Connect during the sync stays.
   */
  async function updateState(started, changes) {
    const latest = await storage.getSyncState();
    if (same(latest, started)) await storage.saveSyncState({ ...latest, ...changes });
  }

  /** One pull, merge, push. Starts over when local data or the file changed meanwhile. */
  async function cycle() {
    const state = await storage.getSyncState();
    if (!state) return { ok: false, error: "not-found" };
    const client = makeClient(state.token);
    const { owner, repo } = state;
    let changedLocal = false;
    try {
      for (let attempt = 1; ; attempt++) {
        const remote = await client.readFile(owner, repo, SYNC_FILE_NAME);
        let remoteFile = null;
        if (remote) {
          const parsed = parseSyncFile(remote.text);
          if (!parsed.ok) throw Object.assign(new Error("bad-file"), { name: "GitHubError", code: "bad-file" });
          remoteFile = parsed.file;
        }
        const now = clock.now();
        const local = await storage.collect();
        const merged = remoteFile ? mergeForSync(local, remoteFile, now) : local;
        if (syncedPart(merged) !== syncedPart(local)) {
          // Something saved since collect() would be lost by the write. Start over.
          if (syncedPart(await storage.collect()) !== syncedPart(local)) {
            if (attempt >= SYNC_MAX_TRIES) throw Object.assign(new Error("conflict"), { name: "GitHubError", code: "conflict" });
            continue;
          }
          await storage.writeSynced(merged);
          changedLocal = true;
          await onLocalChange();
        }
        const file = syncFileFrom(merged, now);
        if (remoteFile && sameSyncData(file, remoteFile)) {
          await updateState(state, { sha: remote.sha, lastSyncAt: now, lastError: null });
          return { ok: true, changedLocal };
        }
        try {
          const sha = await client.writeFile(owner, repo, SYNC_FILE_NAME, syncFileText(file), remote?.sha ?? null, `Sync ${APP_NAME} data`);
          await updateState(state, { sha, lastSyncAt: now, lastError: null });
          return { ok: true, changedLocal };
        } catch (e) {
          if (codeOf(e) !== "conflict" || attempt >= SYNC_MAX_TRIES) throw e;
        }
      }
    } catch (e) {
      const error = codeOf(e);
      await updateState(state, { lastError: error }).catch(() => {});
      return { ok: false, error };
    }
  }

  /**
   * Syncs now. If a sync is running, one more runs after it, and every
   * caller that asked in the meantime gets that result.
   * @returns {Promise<SyncResult>}
   */
  function syncNow() {
    if (!running) {
      running = cycle()
        .catch(() => /** @type {SyncResult} */ ({ ok: false, error: "server" }))
        .finally(() => { running = null; });
      return running;
    }
    if (!queued) {
      queued = running.then(() => {
        queued = null;
        return syncNow();
      });
    }
    return queued;
  }

  return {
    syncNow,

    /**
     * Checks the repository and the token, saves the connection, and syncs.
     * Keeps nothing if the token is refused, the repository is public, or
     * the first sync can't read or write the file.
     * @param {{owner: string, repo: string, token: string}} conn
     * @returns {Promise<SyncResult>}
     */
    async connect({ owner, repo, token }) {
      try {
        const info = await makeClient(token).getRepo(owner, repo);
        if (!info.private) return { ok: false, error: "public-repo" };
      } catch (e) {
        return { ok: false, error: codeOf(e) };
      }
      const conn = { owner, repo, token, sha: null, lastSyncAt: null, lastError: null };
      await storage.saveSyncState(conn);
      const result = await syncNow();
      if (!result.ok && FATAL.includes(result.error) && same(await storage.getSyncState(), conn)) {
        await storage.clearSyncState();
      }
      return result;
    },

    /** Removes the connection and the token. The data stays on the device and on GitHub. */
    disconnect: () => storage.clearSyncState(),
  };
}
