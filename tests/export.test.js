import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arenaText, backupFileName, defaultSettings, makeBackup, mergeData, needsBackupReminder,
  replaceData, validateBackup,
} from "../src/export.js";
import { addCard, createList } from "../src/lists.js";
import { createStorage } from "../src/storage/index.js";
import { createMemoryBackend } from "../src/storage/memory.js";
import { defaultCriteria } from "../src/query.js";
import { fakeClock, snap } from "./helpers.js";

function sampleDeck(clock = fakeClock()) {
  let list = createList("Deck", "deck", clock);
  list = addCard(list, snap("card-normal"), { quantity: 4 }, clock);
  list = addCard(list, snap("card-transform"), { quantity: 2 }, clock);
  list = addCard(list, snap("card-split"), { quantity: 1, section: "sideboard" }, clock);
  list = addCard(list, snap("card-mdfc"), { quantity: 3, section: "sideboard" }, clock);
  list = addCard(list, snap("card-basic-land"), { quantity: 9, section: "maybe" }, clock);
  return list;
}

test("Arena text: main, then Sideboard, without maybe", () => {
  assert.equal(
    arenaText(sampleDeck()),
    "4 Llanowar Elves\n2 Delver of Secrets\n\nSideboard\n1 Fire\n3 Shatterskull Smashing",
  );
});

test("Arena text with no sideboard has no Sideboard line", () => {
  const clock = fakeClock();
  const list = addCard(createList("D", "deck", clock), snap("card-normal"), { quantity: 4 }, clock);
  assert.equal(arenaText(list), "4 Llanowar Elves");
});

test("backup file name", () => {
  assert.equal(backupFileName("2026-03-09T12:00:00.000Z"), "card-discovery-backup-2026-03-09.json");
});

function sampleData(clock) {
  return {
    lists: [sampleDeck(clock)],
    presets: [{ id: "p1", name: "Red", builtIn: false, criteria: { ...defaultCriteria(), colors: ["r"], colorMode: "atLeast" }, createdAt: clock.now(), updatedAt: clock.now() }],
    history: [{ id: "h1", card: snap("card-normal"), query: "f:standard", drawnAt: clock.now() }],
    settings: { ...defaultSettings(), lastUsedListId: "x", lastChangeAt: clock.now() },
  };
}

test("export then import with Replace gives the same data", async () => {
  const clock = fakeClock();
  const a = createStorage(createMemoryBackend(), clock);
  const data = sampleData(clock);
  for (const l of data.lists) await a.saveList(l);
  for (const p of data.presets) await a.savePreset(p);
  for (const h of data.history) await a.addHistory(h);
  await a.saveSettings({ ...(await a.getSettings()), lastUsedListId: data.lists[0].id });

  const backup = JSON.parse(JSON.stringify(await a.exportAll()));
  const check = validateBackup(backup);
  assert.equal(check.ok, true);
  assert.deepEqual(check.counts, { lists: 1, presets: 1, history: 1 });

  const b = createStorage(createMemoryBackend(), clock);
  await b.saveList(createList("Will be removed", "collection", clock));
  await b.importAll(check.backup, "replace");
  assert.deepEqual(await b.getLists(), await a.getLists());
  assert.deepEqual(await b.getPresets(), await a.getPresets());
  assert.deepEqual(await b.getHistory(), await a.getHistory());
  assert.deepEqual(await b.getSettings(), await a.getSettings());
});

test("Merge keeps the item with the later updatedAt, skips known history, keeps settings", () => {
  const current = {
    lists: [
      { id: "L1", name: "Mine newer", updatedAt: "2026-05-01T00:00:00.000Z" },
      { id: "L2", name: "Mine older", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    presets: [],
    history: [{ id: "H1", query: "mine", drawnAt: "2026-01-01T00:00:00.000Z" }],
    settings: { ...defaultSettings(), lastUsedListId: "L1" },
  };
  const backup = {
    lists: [
      { id: "L1", name: "Theirs older", updatedAt: "2026-02-01T00:00:00.000Z" },
      { id: "L2", name: "Theirs newer", updatedAt: "2026-06-01T00:00:00.000Z" },
      { id: "L3", name: "New", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    presets: [{ id: "P1", name: "New preset", builtIn: false, criteria: {}, updatedAt: "2026-01-01T00:00:00.000Z" }],
    history: [
      { id: "H1", query: "theirs", drawnAt: "2026-09-01T00:00:00.000Z" },
      { id: "H2", query: "new", drawnAt: "2026-02-01T00:00:00.000Z" },
    ],
    settings: { ...defaultSettings(), lastUsedListId: "L3" },
  };
  const out = mergeData(current, backup);
  const names = Object.fromEntries(out.lists.map((l) => [l.id, l.name]));
  assert.deepEqual(names, { L1: "Mine newer", L2: "Theirs newer", L3: "New" });
  assert.equal(out.presets.length, 1);
  assert.deepEqual(out.history.map((h) => h.query), ["new", "mine"]);
  assert.equal(out.settings.lastUsedListId, "L1");
});

test("Replace takes the file's settings", () => {
  const clock = fakeClock();
  const backup = makeBackup(sampleData(clock), clock.now());
  assert.equal(replaceData(backup).settings.lastUsedListId, "x");
});

test("a wrong schemaVersion is rejected", () => {
  const clock = fakeClock();
  const backup = { ...makeBackup(sampleData(clock), clock.now()), schemaVersion: 3 };
  const r = validateBackup(backup);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /schema version 3/);
});

test("backups are schema version 2, and version 1 backups still import", () => {
  const clock = fakeClock();
  const backup = makeBackup(sampleData(clock), clock.now());
  assert.equal(backup.schemaVersion, 2);
  assert.equal(validateBackup({ ...structuredClone(backup), schemaVersion: 1 }).ok, true);
});

test("a commander section and a Brawl format pass the backup checks", () => {
  const clock = fakeClock();
  let list = createList("Brawl", "deck", clock, "brawl");
  list = addCard(list, snap("card-legendary"), { section: "commander" }, clock);
  const data = { ...sampleData(clock), lists: [list] };
  assert.equal(validateBackup(makeBackup(data, clock.now())).ok, true);
  const bad = structuredClone(makeBackup(data, clock.now()));
  bad.lists[0].format = "vintage-cube";
  assert.equal(validateBackup(bad).ok, false);
});

test("Arena text for Brawl: Commander block, then Deck", () => {
  const clock = fakeClock();
  let list = createList("Brawl", "deck", clock, "brawl");
  list = addCard(list, snap("card-legendary"), { section: "commander" }, clock);
  list = addCard(list, snap("card-normal"), {}, clock);
  list = addCard(list, snap("card-basic-land"), { quantity: 98 }, clock);
  assert.equal(arenaText(list), "Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Llanowar Elves\n98 Forest");
});

test("other bad files are rejected with reasons", () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: "other", schemaVersion: 1 }).ok, false);
  const clock = fakeClock();
  const backup = makeBackup(sampleData(clock), clock.now());
  const broken = structuredClone(backup);
  broken.lists[0].entries[0].quantity = 0;
  delete broken.history[0].card.scryfallId;
  const r = validateBackup(broken);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /quantity/.test(e)));
  assert.ok(r.errors.some((e) => /scryfallId/.test(e)));
});

test("backup has custom presets only", () => {
  const clock = fakeClock();
  const data = sampleData(clock);
  data.presets.push({ ...data.presets[0], id: "b", builtIn: true });
  assert.equal(makeBackup(data, clock.now()).presets.length, 1);
});

test("backup reminder rule", () => {
  const now = Date.parse("2026-03-20T00:00:00.000Z");
  const s = defaultSettings();
  assert.equal(needsBackupReminder(s, now, 14), false); // Nothing changed yet.
  assert.equal(needsBackupReminder({ ...s, lastChangeAt: "2026-03-01T00:00:00.000Z" }, now, 14), true);
  assert.equal(needsBackupReminder({ ...s, lastChangeAt: "2026-03-10T00:00:00.000Z", lastBackupAt: "2026-03-01T00:00:00.000Z" }, now, 14), true);
  assert.equal(needsBackupReminder({ ...s, lastChangeAt: "2026-03-10T00:00:00.000Z", lastBackupAt: "2026-03-15T00:00:00.000Z" }, now, 14), false);
  assert.equal(needsBackupReminder({ ...s, lastChangeAt: "2026-03-01T00:00:00.000Z", lastBackupAt: "2026-02-01T00:00:00.000Z" }, now, 14), true);
  assert.equal(needsBackupReminder({ ...s, lastChangeAt: "2026-01-01T00:00:00.000Z", lastBackupAt: "2026-02-01T00:00:00.000Z" }, now, 14), false);
});
