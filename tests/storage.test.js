import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/storage/index.js";
import { createMemoryBackend } from "../src/storage/memory.js";
import { createList } from "../src/lists.js";
import { fakeClock, snap } from "./helpers.js";

test("history keeps the newest 100, newest first", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  for (let i = 1; i <= 101; i++) {
    await s.addHistory({ id: `h${i}`, card: snap("card-normal"), query: "q", drawnAt: clock.now() });
  }
  const items = await s.getHistory();
  assert.equal(items.length, 100);
  assert.equal(items[0].id, "h101");
  assert.equal(items.at(-1).id, "h2"); // Item 101 removed the oldest.
  await s.clearHistory();
  assert.equal((await s.getHistory()).length, 0);
});

test("saveList sets updatedAt and lastChangeAt", async () => {
  const clock = fakeClock();
  const s = createStorage(createMemoryBackend(), clock);
  const list = createList("A", "collection", clock);
  await s.saveList(list);
  const saved = await s.getList(list.id);
  assert.ok(saved.updatedAt > list.updatedAt);
  assert.equal((await s.getSettings()).lastChangeAt, saved.updatedAt);
  await s.deleteList(list.id);
  assert.equal(await s.getList(list.id), null);
});

test("stored data is a copy", async () => {
  const s = createStorage(createMemoryBackend(), fakeClock());
  const list = createList("A", "collection", fakeClock());
  await s.saveList(list);
  const a = await s.getList(list.id);
  a.name = "changed";
  assert.equal((await s.getList(list.id)).name, "A");
});

test("settings have defaults", async () => {
  const s = createStorage(createMemoryBackend(), fakeClock());
  const settings = await s.getSettings();
  assert.equal(settings.lastCriteria.format, "standard");
  assert.equal(settings.lastBackupAt, null);
});

test("settings keep nerd mode, Discover mode, and browse sort through storage", async () => {
  const storage = createStorage(createMemoryBackend());
  const s = await storage.getSettings();
  await storage.saveSettings({ ...s, density: "nerd", discoverMode: "browse", browseSort: { order: "cmc", dir: "desc" } });
  await storage.saveList(createList("A", "collection", fakeClock()));
  const back = await storage.getSettings();
  assert.equal(back.density, "nerd");
  assert.equal(back.discoverMode, "browse");
  assert.deepEqual(back.browseSort, { order: "cmc", dir: "desc" });
});
