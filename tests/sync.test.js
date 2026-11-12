// Tests for GitHub sync: deletion markers, backup schema 3, the GitHub
// client, the sync merge, and the full pull, merge, push cycle against a
// fake GitHub. The fake answers with real response bodies from
// tests/fixtures/github-*.json where GitHub's answer can be fetched without
// a token.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_ID, BACKUP_SCHEMA_VERSION, DELETION_KEEP_DAYS, READABLE_BACKUP_VERSIONS, SYNC_FILE_NAME,
} from "../src/config.js";
import { cleanSettings, defaultSettings, makeBackup, mergeData, replaceData, validateBackup } from "../src/export.js";
import { createList, renameList } from "../src/lists.js";
import { createStorage } from "../src/storage/index.js";
import { createMemoryBackend, STORES } from "../src/storage/memory.js";
import { createSyncer } from "../src/storage/sync.js";
import { createGitHub, GitHubError } from "../src/github.js";
import {
  mergeForSync, parseRepo, parseSyncFile, syncErrorText, syncFileFrom, syncFileText, tokenUrl,
} from "../src/sync.js";
import { fakeClock, fixture } from "./helpers.js";

// Helpers ------------------------------------------------------------------------

const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
};
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/**
 * A fake GitHub with one private repository. It records every request and
 * keeps one file. `failNext` makes the next matching request fail once.
 */
function fakeGitHub({ isPrivate = true, token = "good-token", readOnly = false } = {}) {
  const gh = {
    /** Runs before the fake answers a PUT, as if something happened during the write. */
    onPut: null,
    file: null, // { text, sha }
    requests: [],
    shaCount: 0,
    failNext: null, // { method, status, body, before?: () => void }
    async fetch(url, init = {}) {
      const u = new URL(url);
      const method = init.method ?? "GET";
      const headers = new Headers(init.headers);
      gh.requests.push({ method, path: u.pathname, headers, body: init.body ? JSON.parse(init.body) : null });
      if (headers.get("Authorization") !== `Bearer ${token}`) return json(401, fixture("github-401"));
      if (gh.failNext && gh.failNext.method === method) {
        const f = gh.failNext;
        gh.failNext = null;
        f.before?.();
        return json(f.status, f.body ?? { message: "Conflict" });
      }
      if (u.pathname === "/repos/me/cards") {
        return json(200, { ...fixture("github-repo"), name: "cards", full_name: "me/cards", private: isPrivate });
      }
      if (u.pathname !== `/repos/me/cards/contents/${SYNC_FILE_NAME}`) return json(404, fixture("github-contents-404"));
      if (method === "GET") {
        if (!gh.file) return json(404, fixture("github-contents-404"));
        if (headers.get("Accept") === "application/vnd.github.raw+json") {
          return new Response(gh.file.text, { status: 200 });
        }
        const big = gh.file.text.length > 1_000_000;
        return json(200, {
          ...fixture("github-contents"),
          name: SYNC_FILE_NAME,
          path: SYNC_FILE_NAME,
          sha: gh.file.sha,
          size: gh.file.text.length,
          encoding: big ? "none" : "base64",
          content: big ? "" : b64(gh.file.text).replace(/(.{60})/g, "$1\n"),
        });
      }
      if (method === "PUT") {
        if (gh.onPut) await gh.onPut();
        if (readOnly) return json(403, { message: "Resource not accessible by personal access token" });
        const body = JSON.parse(init.body);
        if ((gh.file?.sha ?? undefined) !== body.sha) return json(409, { message: "is at a different sha" });
        gh.put(unb64(body.content));
        return json(gh.file ? 200 : 201, { content: { ...fixture("github-contents"), sha: gh.file.sha }, commit: {} });
      }
      return json(404, fixture("github-contents-404"));
    },
    /** Writes the file as another device would. */
    put(text) {
      gh.file = { text, sha: `sha-${++gh.shaCount}` };
    },
    remote() {
      return gh.file ? JSON.parse(gh.file.text) : null;
    },
    puts() {
      return gh.requests.filter((r) => r.method === "PUT").length;
    },
  };
  return gh;
}

/** A device: its own storage, and a syncer that talks to the shared fake GitHub. */
function device(gh, clock, { wrap = (s) => s, onLocalChange } = {}) {
  const storage = createStorage(createMemoryBackend(), clock);
  const syncer = createSyncer({
    storage: wrap(storage),
    clock,
    makeClient: (token) => createGitHub({ token, fetchImpl: (u, i) => gh.fetch(u, i) }),
    onLocalChange,
  });
  return { storage, syncer };
}

async function connected(gh, clock) {
  const d = device(gh, clock);
  const r = await d.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.equal(r.ok, true, JSON.stringify(r));
  return d;
}

const names = async (storage) => (await storage.getLists()).map((l) => l.name).sort();

// Backup schema 3 and deletion markers ------------------------------------------

test("backups are schema 3 and carry deletion markers", () => {
  assert.equal(BACKUP_SCHEMA_VERSION, 3);
  assert.deepEqual(READABLE_BACKUP_VERSIONS, [1, 2, 3]);
  const marker = { id: "x", kind: "list", deletedAt: "2026-02-01T00:00:00.000Z" };
  const b = makeBackup({ lists: [], presets: [], history: [], settings: defaultSettings(), deletions: [marker] }, "2026-02-02T00:00:00.000Z");
  assert.equal(b.schemaVersion, 3);
  assert.deepEqual(b.deletions, [marker]);
  assert.equal(validateBackup(JSON.parse(JSON.stringify(b))).ok, true);
});

test("schema 2 backups without deletion markers still import", () => {
  const clock = fakeClock();
  const old = {
    app: APP_ID, schemaVersion: 2, exportedAt: clock.now(),
    lists: [createList("Old", "collection", clock)], presets: [], history: [], settings: defaultSettings(),
  };
  const r = validateBackup(old);
  assert.equal(r.ok, true);
  assert.deepEqual(replaceData(r.backup).deletions, []);
  const merged = mergeData({ lists: [], presets: [], history: [], settings: defaultSettings(), deletions: [] }, r.backup);
  assert.deepEqual(merged.lists.map((l) => l.name), ["Old"]);
  assert.deepEqual(merged.deletions, []);
});

test("a schema 3 backup needs a valid deletions list", () => {
  const base = { app: APP_ID, schemaVersion: 3, exportedAt: "2026-02-02T00:00:00.000Z", lists: [], presets: [], history: [], settings: {} };
  assert.equal(validateBackup(base).ok, false);
  assert.equal(validateBackup({ ...base, deletions: [{ id: "x", kind: "card", deletedAt: "2026-02-01T00:00:00.000Z" }] }).ok, false);
  assert.equal(validateBackup({ ...base, deletions: [{ id: "x", kind: "list", deletedAt: "soon" }] }).ok, false);
  assert.equal(validateBackup({ ...base, deletions: [{ id: "x", kind: "preset", deletedAt: "2026-02-01T00:00:00.000Z" }] }).ok, true);
});

test("merge removes items deleted after their last change, and keeps items changed after", () => {
  const clock = fakeClock();
  const gone = createList("Gone", "collection", clock);
  const back = createList("Back", "collection", clock);
  const current = { lists: [gone, back], presets: [], history: [], settings: defaultSettings(), deletions: [] };
  const goneMarker = { id: gone.id, kind: "list", deletedAt: clock.now() };
  const backMarker = { id: back.id, kind: "list", deletedAt: clock.now() };
  const backAgain = renameList(back, "Back again", clock); // Changed after the delete.
  const incoming = {
    app: APP_ID, schemaVersion: 3, exportedAt: clock.now(),
    lists: [backAgain], presets: [], history: [], settings: defaultSettings(), deletions: [goneMarker, backMarker],
  };
  const merged = mergeData(current, incoming);
  assert.deepEqual(merged.lists.map((l) => l.name), ["Back again"]);
  assert.deepEqual(merged.deletions.map((d) => d.id), [gone.id]);
});

test("settings keep the date of the last synced settings change", () => {
  assert.equal(cleanSettings({ syncSettingsAt: "2026-02-01T00:00:00.000Z" }).syncSettingsAt, "2026-02-01T00:00:00.000Z");
  assert.equal(cleanSettings({ syncSettingsAt: "later" }).syncSettingsAt, null);
  assert.equal(defaultSettings().syncSettingsAt, null);
});

// Storage ------------------------------------------------------------------------

test("storage has a deletions store", () => {
  assert.ok(STORES.includes("deletions"));
});

test("deleting a list or preset leaves a marker, and saving it again removes the marker", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  const list = createList("A", "collection", clock);
  await s.saveList(list);
  await s.deleteList(list.id);
  const [marker] = await s.getDeletions();
  assert.equal(marker.id, list.id);
  assert.equal(marker.kind, "list");
  assert.ok(marker.deletedAt > list.updatedAt);
  await s.saveList(list); // Undo.
  assert.deepEqual(await s.getDeletions(), []);
  await s.savePreset({ id: "p1", name: "P", criteria: {}, createdAt: clock.now(), updatedAt: clock.now() });
  await s.deletePreset("p1");
  assert.equal((await s.getDeletions())[0].kind, "preset");
});

test("exported backups hold the markers and never the GitHub token", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  await s.saveSyncState({ owner: "me", repo: "cards", token: "secret-token", sha: null, lastSyncAt: null, lastError: null });
  const list = createList("A", "collection", clock);
  await s.saveList(list);
  await s.deleteList(list.id);
  const backup = await s.exportAll();
  assert.equal(backup.deletions.length, 1);
  assert.ok(!JSON.stringify(backup).includes("secret-token"));
});

test("importing a backup keeps the sync connection", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  await s.saveSyncState({ owner: "me", repo: "cards", token: "t", sha: "abc", lastSyncAt: null, lastError: null });
  const backup = await s.exportAll();
  await s.importAll(backup, "replace");
  assert.equal((await s.getSyncState())?.token, "t");
  await s.clearSyncState();
  assert.equal(await s.getSyncState(), null);
});

test("saveSettings dates a change to a synced setting, and only then", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  await s.saveSettings({ ...(await s.getSettings()), lastBackupAt: clock.now() });
  assert.equal((await s.getSettings()).syncSettingsAt, null);
  await s.saveSettings({ ...(await s.getSettings()), density: "nerd" });
  const at = (await s.getSettings()).syncSettingsAt;
  assert.ok(at);
  // A stale copy of the settings doesn't move the date back.
  await s.saveSettings({ ...(await s.getSettings()), syncSettingsAt: null, lastUsedListId: "x" });
  assert.equal((await s.getSettings()).syncSettingsAt, at);
});

// Pure sync helpers --------------------------------------------------------------

test("parseRepo reads account/name and GitHub links", () => {
  assert.deepEqual(parseRepo("me/cards"), { owner: "me", repo: "cards" });
  assert.deepEqual(parseRepo(" https://github.com/me/cards.git "), { owner: "me", repo: "cards" });
  assert.deepEqual(parseRepo("github.com/me/my.cards-1/"), { owner: "me", repo: "my.cards-1" });
  assert.equal(parseRepo("cards"), null);
  assert.equal(parseRepo("me/cards/extra"), null);
  assert.equal(parseRepo("me/ca rds"), null);
});

test("the token link asks for Contents write on the repository's account", () => {
  const u = new URL(tokenUrl("me"));
  assert.equal(u.origin + u.pathname, "https://github.com/settings/personal-access-tokens/new");
  assert.equal(u.searchParams.get("contents"), "write");
  assert.equal(u.searchParams.get("target_name"), "me");
  assert.ok(u.searchParams.get("name").length <= 40);
});

test("the sync file is a schema 3 backup without history, with synced settings only", () => {
  const clock = fakeClock();
  const b = createList("B", "collection", clock);
  const a = createList("A", "collection", clock);
  const settings = { ...defaultSettings(), density: "nerd", lastUsedListId: a.id, lastBackupAt: clock.now() };
  const history = [{ id: "h", card: {}, query: "q", drawnAt: clock.now() }];
  const file = syncFileFrom({ lists: [b, a], presets: [], history, settings, deletions: [] }, clock.now());
  assert.equal(file.schemaVersion, 3);
  assert.deepEqual(file.history, []);
  assert.deepEqual(file.lists.map((l) => l.id), [a.id, b.id].sort());
  assert.equal(file.settings.density, "nerd");
  assert.equal(file.settings.lastUsedListId, null);
  assert.equal(file.settings.lastBackupAt, null);
  const parsed = parseSyncFile(syncFileText(file));
  assert.equal(parsed.ok, true);
  assert.equal(parseSyncFile("{not json").ok, false);
  assert.equal(parseSyncFile(JSON.stringify({ app: "other" })).ok, false);
});

test("mergeForSync takes newer synced settings, keeps device settings, and drops old markers", () => {
  const clock = fakeClock("2026-06-01T00:00:00.000Z");
  const now = "2026-06-01T00:10:00.000Z";
  const local = {
    lists: [], presets: [], history: [{ id: "h", card: {}, query: "q", drawnAt: now }],
    settings: { ...defaultSettings(), lastUsedListId: "mine", density: "comfortable", syncSettingsAt: "2026-05-01T00:00:00.000Z" },
    deletions: [{ id: "old", kind: "list", deletedAt: new Date(Date.parse(now) - (DELETION_KEEP_DAYS + 1) * 86400000).toISOString() }],
  };
  const remote = syncFileFrom({
    lists: [createList("R", "collection", clock)], presets: [], history: [],
    settings: { ...defaultSettings(), density: "nerd", browseSort: { order: "cmc", dir: "desc" }, syncSettingsAt: "2026-05-20T00:00:00.000Z" },
    deletions: [{ id: "new", kind: "list", deletedAt: now }],
  }, now);
  const m = mergeForSync(local, remote, now);
  assert.deepEqual(m.lists.map((l) => l.name), ["R"]);
  assert.equal(m.history.length, 1);
  assert.equal(m.settings.density, "nerd");
  assert.equal(m.settings.browseSort.order, "cmc");
  assert.equal(m.settings.lastUsedListId, "mine");
  assert.equal(m.settings.syncSettingsAt, "2026-05-20T00:00:00.000Z");
  assert.deepEqual(m.deletions.map((d) => d.id), ["new"]);
  // Older remote settings lose.
  const m2 = mergeForSync({ ...local, settings: { ...local.settings, syncSettingsAt: "2026-05-30T00:00:00.000Z" } }, remote, now);
  assert.equal(m2.settings.density, "comfortable");
});

test("every sync error has plain text", () => {
  for (const code of ["unauthorized", "forbidden", "not-found", "public-repo", "conflict", "rate-limited", "network", "server", "bad-file"]) {
    assert.match(syncErrorText(code), /^[A-Z].+\.$/, code);
  }
});

// GitHub client ------------------------------------------------------------------

test("readFile sends the token and GitHub's headers, and decodes the file", async () => {
  const calls = [];
  const gh = createGitHub({
    token: "tok",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return json(200, fixture("github-contents"));
    },
  });
  const f = await gh.readFile("octocat", "Hello-World", "README");
  assert.equal(f.text, "Hello World!\n");
  assert.equal(f.sha, fixture("github-contents").sha);
  assert.equal(calls[0].url, "https://api.github.com/repos/octocat/Hello-World/contents/README");
  const h = new Headers(calls[0].init.headers);
  assert.equal(h.get("Authorization"), "Bearer tok");
  assert.equal(h.get("Accept"), "application/vnd.github+json");
  assert.equal(h.get("X-GitHub-Api-Version"), "2022-11-28");
  assert.equal(h.get("User-Agent"), null);
  assert.equal(calls[0].init.cache, "no-store");
});

test("readFile returns null for a missing file, and errors have codes", async () => {
  const reply = (status, body, headers) => createGitHub({ token: "t", fetchImpl: async () => json(status, body, headers) });
  assert.equal(await reply(404, fixture("github-contents-404")).readFile("a", "b", "c"), null);
  const code = async (p) => p.then(() => "none", (e) => (e instanceof GitHubError ? e.code : `not a GitHubError: ${e}`));
  assert.equal(await code(reply(401, fixture("github-401")).readFile("a", "b", "c")), "unauthorized");
  assert.equal(await code(reply(403, { message: "Resource not accessible by personal access token" }).readFile("a", "b", "c")), "forbidden");
  assert.equal(await code(reply(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }).readFile("a", "b", "c")), "rate-limited");
  assert.equal(await code(reply(429, {}).readFile("a", "b", "c")), "rate-limited");
  assert.equal(await code(reply(502, {}).readFile("a", "b", "c")), "server");
  assert.equal(await code(reply(404, fixture("github-contents-404")).getRepo("a", "b")), "not-found");
  const offline = createGitHub({ token: "t", fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(await code(offline.readFile("a", "b", "c")), "network");
});

test("readFile asks for the raw file when GitHub leaves out a large file's content", async () => {
  const gh = fakeGitHub();
  gh.put(JSON.stringify({ big: "x".repeat(1_100_000) }));
  const client = createGitHub({ token: "good-token", fetchImpl: (u, i) => gh.fetch(u, i) });
  const f = await client.readFile("me", "cards", SYNC_FILE_NAME);
  assert.equal(JSON.parse(f.text).big.length, 1_100_000);
  assert.equal(f.sha, gh.file.sha);
});

test("writeFile sends UTF-8 base64 and the old sha, and a 409 is a conflict", async () => {
  const gh = fakeGitHub();
  const client = createGitHub({ token: "good-token", fetchImpl: (u, i) => gh.fetch(u, i) });
  const sha1 = await client.writeFile("me", "cards", SYNC_FILE_NAME, "Æther ✓\n", null, "Add file");
  assert.equal(gh.file.text, "Æther ✓\n");
  assert.equal(sha1, gh.file.sha);
  const put = gh.requests.at(-1);
  assert.equal(put.body.message, "Add file");
  assert.equal(put.body.sha, undefined);
  await client.writeFile("me", "cards", SYNC_FILE_NAME, "two", gh.file.sha, "Update");
  assert.equal(gh.file.text, "two");
  await assert.rejects(client.writeFile("me", "cards", SYNC_FILE_NAME, "three", "stale", "Update"), (e) => e.code === "conflict");
});

// The sync cycle -----------------------------------------------------------------

test("connect refuses a public repository and a bad token, and changes no data", async () => {
  const clock = fakeClock();
  const pub = device(fakeGitHub({ isPrivate: false }), clock);
  const r1 = await pub.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.deepEqual(r1, { ok: false, error: "public-repo" });
  assert.equal(await pub.storage.getSyncState(), null);
  const gh = fakeGitHub();
  const d = device(gh, clock);
  await d.storage.saveList(createList("Mine", "collection", clock));
  const r2 = await d.syncer.connect({ owner: "me", repo: "cards", token: "wrong" });
  assert.deepEqual(r2, { ok: false, error: "unauthorized" });
  assert.equal(await d.storage.getSyncState(), null);
  assert.deepEqual(await names(d.storage), ["Mine"]);
  assert.equal(gh.puts(), 0);
});

test("the first sync writes the file to an empty repository", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = device(gh, clock);
  await d.storage.saveList(createList("Elves", "collection", clock));
  await d.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.deepEqual(gh.remote().lists.map((l) => l.name), ["Elves"]);
  const state = await d.storage.getSyncState();
  assert.equal(state.sha, gh.file.sha);
  assert.ok(state.lastSyncAt);
  assert.equal(state.lastError, null);
});

test("two devices end up with the same lists, and a delete reaches both", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const a = await connected(gh, clock);
  const b = await connected(gh, clock);
  const elves = createList("Elves", "collection", clock);
  await a.storage.saveList(elves);
  await a.syncer.syncNow();
  await b.storage.saveList(createList("Goblins", "deck", clock));
  const r = await b.syncer.syncNow();
  assert.equal(r.ok, true);
  assert.equal(r.changedLocal, true);
  assert.deepEqual(await names(b.storage), ["Elves", "Goblins"]);
  await a.syncer.syncNow();
  assert.deepEqual(await names(a.storage), ["Elves", "Goblins"]);
  await a.storage.deleteList(elves.id);
  await a.syncer.syncNow();
  await b.syncer.syncNow();
  assert.deepEqual(await names(b.storage), ["Goblins"]);
  assert.deepEqual(gh.remote().deletions.map((d) => d.id), [elves.id]);
});

test("a sync with no changes doesn't write to GitHub", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  const before = gh.puts();
  const r = await d.syncer.syncNow();
  assert.equal(r.ok, true);
  assert.equal(r.changedLocal, false);
  assert.equal(gh.puts(), before);
});

test("when another device writes first, the sync reads again and keeps both changes", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const a = await connected(gh, clock);
  const b = await connected(gh, clock);
  await a.storage.saveList(createList("From A", "collection", clock));
  await b.storage.saveList(createList("From B", "collection", clock));
  const bText = syncFileText(syncFileFrom(await b.storage.exportAll(), clock.now()));
  // B writes between A's read and A's write, so A's write is refused.
  gh.failNext = { method: "PUT", status: 409, before: () => gh.put(bText) };
  const r = await a.syncer.syncNow();
  assert.equal(r.ok, true);
  assert.equal(gh.failNext, null);
  assert.deepEqual(gh.remote().lists.map((l) => l.name).sort(), ["From A", "From B"]);
  assert.deepEqual(await names(a.storage), ["From A", "From B"]);
});

test("a token that stops working is reported, and local data stays", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  await d.storage.saveSyncState({ ...(await d.storage.getSyncState()), token: "revoked" });
  await d.storage.saveList(createList("Keep me", "collection", clock));
  const r = await d.syncer.syncNow();
  assert.deepEqual(r, { ok: false, error: "unauthorized" });
  assert.equal((await d.storage.getSyncState()).lastError, "unauthorized");
  assert.deepEqual(await names(d.storage), ["Keep me"]);
});

test("a file on GitHub that isn't a valid sync file stops the sync without changes", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  gh.put("{ broken");
  const before = gh.puts();
  await d.storage.saveList(createList("Mine", "collection", clock));
  const r = await d.syncer.syncNow();
  assert.deepEqual(r, { ok: false, error: "bad-file" });
  assert.equal(gh.puts(), before);
  assert.deepEqual(await names(d.storage), ["Mine"]);
});

test("syncs started together run one at a time", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  let active = 0;
  let most = 0;
  const realFetch = gh.fetch;
  gh.fetch = async (u, i) => {
    active++;
    most = Math.max(most, active);
    await new Promise((r) => setTimeout(r, 5));
    try {
      return await realFetch(u, i);
    } finally {
      active--;
    }
  };
  await d.storage.saveList(createList("X", "collection", clock));
  const results = await Promise.all([d.syncer.syncNow(), d.syncer.syncNow(), d.syncer.syncNow()]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(most, 1);
  assert.deepEqual(gh.remote().lists.map((l) => l.name), ["X"]);
});

// Fixes from the review --------------------------------------------------------

test("the app hears about changed data before the write to GitHub starts", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const events = [];
  const a = await connected(gh, clock);
  await a.storage.saveList(createList("From A", "collection", clock));
  await a.syncer.syncNow();
  const b = device(gh, clock, { onLocalChange: () => events.push(`local after ${gh.puts()} writes`) });
  await b.storage.saveList(createList("From B", "collection", clock));
  const before = gh.puts();
  await b.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.deepEqual(events, [`local after ${before} writes`]);
});

test("Disconnect during a write doesn't bring the token back", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  await d.storage.saveList(createList("X", "collection", clock));
  gh.onPut = () => d.syncer.disconnect();
  await d.syncer.syncNow();
  assert.equal(await d.storage.getSyncState(), null);
});

test("a list saved while a sync reads local data is kept, and history isn't rewritten", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const a = await connected(gh, clock);
  await a.storage.saveList(createList("Remote", "collection", clock));
  await a.syncer.syncNow();
  let once = false;
  const late = createList("Saved during sync", "collection", clock);
  const b = device(gh, clock, {
    wrap: (st) => ({
      ...st,
      async collect() {
        const r = await st.collect();
        if (!once) {
          once = true;
          await st.saveList(late);
          await st.addHistory({ id: "h-late", card: {}, query: "q", drawnAt: clock.now() });
        }
        return r;
      },
    }),
  });
  const r = await b.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.equal(r.ok, true);
  assert.deepEqual(await names(b.storage), ["Remote", "Saved during sync"]);
  assert.deepEqual((await b.storage.getHistory()).map((h) => h.id), ["h-late"]);
  assert.ok(gh.remote().lists.some((l) => l.id === late.id));
});

test("Replace import while connected removes the other lists on GitHub too", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  const d = await connected(gh, clock);
  const keep = createList("Keep", "collection", clock);
  await d.storage.saveList(keep);
  await d.storage.saveList(createList("Drop", "collection", clock));
  const backup = await d.storage.exportAll();
  backup.lists = backup.lists.filter((l) => l.id === keep.id);
  await d.syncer.syncNow();
  await d.storage.importAll(backup, "replace");
  await d.syncer.syncNow();
  assert.deepEqual(gh.remote().lists.map((l) => l.name), ["Keep"]);
  assert.deepEqual(await names(d.storage), ["Keep"]);
});

test("a token that can read but not write doesn't stay connected", async () => {
  const clock = fakeClock();
  const d = device(fakeGitHub({ readOnly: true }), clock);
  const r = await d.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  assert.deepEqual(r, { ok: false, error: "forbidden" });
  assert.equal(await d.storage.getSyncState(), null);
});

test("a sync that throws doesn't block the next one", async () => {
  const clock = fakeClock();
  const gh = fakeGitHub();
  let fail = false;
  const d = device(gh, clock, {
    wrap: (st) => ({ ...st, async collect() { if (fail) { fail = false; throw new Error("storage broke"); } return st.collect(); } }),
  });
  await d.syncer.connect({ owner: "me", repo: "cards", token: "good-token" });
  fail = true;
  const r1 = await d.syncer.syncNow();
  assert.equal(r1.ok, false);
  const r2 = await d.syncer.syncNow();
  assert.equal(r2.ok, true);
});

test("GitHub's other 403 and 422 answers get the right codes", async () => {
  const reply = (status, body, headers) => createGitHub({ token: "t", fetchImpl: async () => json(status, body, headers) });
  const code = async (p) => p.then(() => "none", (e) => e.code);
  assert.equal(await code(reply(403, { message: "You have exceeded a secondary rate limit" }, { "retry-after": "60" }).readFile("a", "b", "c")), "rate-limited");
  assert.equal(await code(reply(422, { message: "Invalid request.\n\n\"sha\" wasn't supplied." }).writeFile("a", "b", "c", "x", null, "m")), "conflict");
  assert.equal(await code(reply(422, { message: "Invalid request." }).writeFile("a", "b", "c", "x", null, "m")), "server");
});
