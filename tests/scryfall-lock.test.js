// Tests for scripts/scryfall-lock.sh, which lets only one process at a time
// on this computer run a command that sends Scryfall requests. Parallel
// agents wrap check-ui.mjs, check-api.mjs, and fetch-fixtures.sh in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCK_SCRIPT = fileURLToPath(new URL("../scripts/scryfall-lock.sh", import.meta.url));

/**
 * Runs the lock script with a shell command and resolves with its exit code,
 * or with "timeout" when it hasn't finished after `limit` ms.
 */
function run(lock, command, env = {}, limit = 10000, args = ["sh", "-c", command]) {
  return new Promise((done) => {
    const child = spawn(LOCK_SCRIPT, args, {
      env: { ...process.env, SCRYFALL_LOCK: lock, SCRYFALL_LOCK_POLL: "0.1", ...env },
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done("timeout");
    }, limit);
    child.on("exit", (code) => {
      clearTimeout(timer);
      done(code);
    });
  });
}

/** The ID of a process that has already ended. */
function deadPid() {
  return spawnSync("sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
}

test("two runs at the same time never overlap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  const lock = join(dir, "lock");
  const log = join(dir, "log");
  const step = (name) => `echo "start ${name}" >> "${log}"; sleep 0.5; echo "end ${name}" >> "${log}"`;
  await Promise.all([run(lock, step("a")), run(lock, step("b"))]);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^start /);
  assert.equal(lines[1], lines[0].replace("start", "end"), "the first run ends before the second starts");
  assert.ok(!existsSync(lock), "the lock is gone after both runs");
  rmSync(dir, { recursive: true });
});

test("the command's exit code comes back, and a failure frees the lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  const lock = join(dir, "lock");
  assert.equal(await run(lock, "exit 3"), 3);
  assert.ok(!existsSync(lock));
  assert.equal(await run(lock, "exit 0"), 0);
  rmSync(dir, { recursive: true });
});

test("a lock left by a crashed run is cleared after the stale time", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  const lock = join(dir, "lock");
  mkdirSync(lock);
  const old = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(lock, old, old);
  assert.equal(await run(lock, "exit 0", { SCRYFALL_LOCK_STALE_MINUTES: "25" }), 0);
  assert.ok(!existsSync(lock));
  rmSync(dir, { recursive: true });
});

test("a lock whose holder has ended is cleared at once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  const lock = join(dir, "lock");
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), deadPid() + "\n");
  assert.equal(await run(lock, "exit 0", {}, 3000), 0);
  assert.ok(!existsSync(lock));
  rmSync(dir, { recursive: true });
});

test("a lock whose holder still runs is kept, however old it is", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  const lock = join(dir, "lock");
  const marker = join(dir, "ran");
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), process.pid + "\n");
  const old = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(lock, old, old);
  assert.equal(await run(lock, `touch "${marker}"`, { SCRYFALL_LOCK_STALE_MINUTES: "25" }, 1500), "timeout");
  assert.ok(!existsSync(marker), "the command waits for the live holder");
  assert.ok(existsSync(join(lock, "pid")), "the live holder's lock is untouched");
  rmSync(dir, { recursive: true });
});

test("a lock that can't be made stops with an error instead of waiting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  assert.equal(await run(join(dir, "missing", "lock"), "exit 0", {}, 3000), 1);
  rmSync(dir, { recursive: true });
});

test("no command prints the usage and exits with 2", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scryfall-lock-"));
  assert.equal(await run(join(dir, "lock"), "", {}, 3000, []), 2);
  rmSync(dir, { recursive: true });
});
