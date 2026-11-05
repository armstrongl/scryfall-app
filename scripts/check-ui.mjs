// Browser tests for the app. Runs the real app in headless Chrome at phone
// width (390 px) and desktop width (1280 px), in light and dark mode.
// Uses only Node.js built-ins and an installed Chrome: no packages.
//
// Run: node scripts/check-ui.mjs
// Set CHROME_PATH if Chrome is not in the usual place.
//
// The app sends real Scryfall requests (draws and pool counts) through its
// own queue, so the queue's spacing applies. Each run uses a new, empty
// browser profile, so saved criteria and lists from one run can't change
// the next. Exits with code 1 if a check fails.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONFIGS = [
  { width: 390, scheme: "light" },
  { width: 390, scheme: "dark" },
  { width: 1280, scheme: "light" },
  { width: 1280, scheme: "dark" },
];

// Static server ------------------------------------------------------------------
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon",
};

function startServer() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = normalize(join(ROOT, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(ROOT + sep) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

// Chrome ---------------------------------------------------------------------------
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH to the Chrome executable.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "card-discovery-ui-"));
  const proc = spawn(chromePath(), [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(200);
  if (!existsSync(portFile)) throw new Error("Chrome did not start.");
  await sleep(200);
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  const close = async () => {
    proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  };
  return { port, close };
}

async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      errors.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(`${expression}\n=> ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
    }
    return r.result?.result?.value;
  };
  const until = async (expression, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(expression)) return true;
      await sleep(250);
    }
    return false;
  };
  const key = async (k, code) => {
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: code });
    }
  };
  await send("Runtime.enable");
  await send("Page.enable");
  return { send, ev, until, key, errors, close: () => ws.close() };
}

// Checks ---------------------------------------------------------------------------
const FOCUS = `(document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "")`;
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`;
const clickText = (selector, text) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent === ${JSON.stringify(text)}).click()`;

/** Find synergies: the panel, its keyboard behavior, and the trip to Discover. */
async function findSynergies(b, base, check) {
  const { ev, until, key } = b;
  const hashNow = () => ev("location.hash");

  // A Goblin creature always has suggestions ("Rewards for Goblins"), so the
  // later checks don't depend on which random card comes back.
  await ev(`(() => {
    const raw = document.querySelector("#view-discover textarea");
    raw.value = "t:goblin t:creature";
    raw.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  check("raw query reaches the query preview", await until(`document.querySelector("code.query").textContent.includes("(t:goblin t:creature)")`, 3000));
  await until(`/match/.test(document.querySelector(".pool").textContent)`);
  await ev(clickText("button", "Draw"));
  check("draw a Goblin creature", await until(`!!document.querySelector(".results .card")`));
  check("drawn card has Find synergies", await until(`!!document.querySelector(".results button[aria-label^='Find synergies']")`));
  await until(`!!document.querySelector(".history button[aria-label^='Find synergies']")`);

  // History button: open, Escape, Close, focus.
  await ev(`document.querySelector(".history button[aria-label^='Find synergies']").focus()`);
  const opener = await ev(FOCUS);
  await ev("document.activeElement.click()");
  await sleep(300);
  check("History button opens the panel", await ev(`!!document.querySelector("dialog[open] #synergy-title")`));
  check("focus starts inside the panel", await ev(`document.querySelector("dialog")?.contains(document.activeElement) ?? false`), await ev(FOCUS));
  await key("Escape", 27);
  await sleep(300);
  check("Escape removes the panel", await ev(`document.querySelectorAll("dialog").length === 0`));
  check("Escape returns focus to the button that opened it", (await ev(FOCUS)) === opener, await ev(FOCUS));
  await ev("document.activeElement.click()");
  await sleep(300);
  await ev(clickText("dialog button", "Close"));
  await sleep(300);
  check("Close removes the panel", await ev(`document.querySelectorAll("dialog").length === 0`));
  check("Close returns focus to the button that opened it", (await ev(FOCUS)) === opener, await ev(FOCUS));

  // A card with nothing to suggest, from the real Forest fixture. No request.
  await ev(`(async () => {
    const { makeSnapshot } = await import("${base}/src/cards.js");
    const { openSynergyPanel } = await import("${base}/src/ui/synergy-panel.js");
    const card = await (await fetch("${base}/tests/fixtures/card-basic-land.json")).json();
    openSynergyPanel({ settings: { lastCriteria: {} }, showInDiscover() {} }, makeSnapshot(card, ""));
  })()`);
  await sleep(300);
  const empty = await ev(`document.querySelector("dialog .msg")?.textContent ?? ""`);
  check("no-suggestions message shows", /found no patterns/.test(empty), empty);
  check("no-suggestions panel focuses Close", (await ev(FOCUS)) === "Close", await ev(FOCUS));
  await key("Escape", 27);
  await sleep(300);

  // Search in Discover, count, and draw from the synergy search.
  await ev(`document.querySelector(".history button[aria-label^='Find synergies']").click()`);
  await sleep(300);
  if (!(await ev(`!!document.querySelector(".synergy button")`))) {
    check("drawn card has a suggestion (needed for the next checks)", false, await ev(`document.querySelector("#synergy-title")?.textContent`));
    return;
  }
  await ev(click(".synergy button"));
  await sleep(300);
  const query = await ev(`document.querySelector("code.query").textContent`);
  check("Search in Discover loads the query without the card itself", query.includes(' -!"'), query);
  check("Discover explains where the search came from", /Cards that may work with/.test(await ev(`document.querySelector(".draw-notes").textContent`)));
  check("focus moves to Draw", (await ev(FOCUS)) === "Draw", await ev(FOCUS));
  const counted = await until(`!/Counting/.test(document.querySelector(".pool").textContent)`);
  const pool = await ev(`document.querySelector(".pool").textContent`);
  check("pool count finishes", counted && /match/.test(pool), pool);
  if (!/^0 cards/.test(pool)) {
    await ev(clickText("button", "Draw"));
    const drew = await until(`!!document.querySelector(".results .card")`);
    const logged = await ev(`document.querySelector(".history .mono")?.textContent`);
    check("draw from the synergy search", drew && logged === query, logged);
  }

  // List row: save a card, open the list, search, then Back.
  await ev(clickText(".history button", "Add to list"));
  await sleep(300);
  await ev(`(() => {
    document.querySelector("dialog input[placeholder='Name of a new list']").value = "UI check";
    document.querySelector("dialog button[type=submit]").click();
  })()`);
  await sleep(800);
  await ev(`location.hash = "#lists"`);
  await sleep(800);
  const href = await ev(`[...document.querySelectorAll("a")].find((a) => a.textContent.includes("UI check"))?.getAttribute("href")`);
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await sleep(800);
  check("list row has Find synergies", await ev(`!!document.querySelector(".entry button[aria-label^='Find synergies']")`));
  await ev(`document.querySelector(".entry button[aria-label^='Find synergies']").click()`);
  await sleep(300);
  if (!(await ev(`!!document.querySelector(".synergy button")`))) {
    check("list card has a suggestion (needed for the next checks)", false);
    return;
  }
  await ev(click(".synergy button"));
  await sleep(500);
  check("list row search opens Discover", (await hashNow()) === "#discover"
    && await ev(`!document.getElementById("view-discover").hidden && document.getElementById("view-lists").hidden`));
  check("focus moves to Draw from Lists", (await ev(FOCUS)) === "Draw", await ev(FOCUS));
  await ev("history.back()");
  await sleep(800);
  check("Back returns to the list", (await hashNow()) === href
    && await ev(`!document.getElementById("view-lists").hidden && document.getElementById("view-discover").hidden`), await hashNow());
}

// Runner ---------------------------------------------------------------------------
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
let failed = 0;
let total = 0;

for (const { width, scheme } of CONFIGS) {
  console.log(`\n## ${width} px, ${scheme} mode`);
  const chrome = await launchChrome();
  const b = await connect(chrome.port);
  const check = (name, ok, detail = "") => {
    total++;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
  };
  try {
    await b.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await b.send("Page.navigate", { url: `${base}/#discover` });
    check("app starts", await b.until(`!!document.querySelector("#view-discover h1")`));
    await findSynergies(b, base, check);
    check("no horizontal page scroll", !(await b.ev("document.documentElement.scrollWidth > window.innerWidth")));
    check("no console errors", b.errors.length === 0, b.errors.join(" | "));
  } catch (e) {
    check("run without errors", false, e.message);
  } finally {
    b.close();
    await chrome.close();
  }
}

server.close();
console.log(`\n${total - failed} of ${total} checks passed.`);
process.exit(failed ? 1 : 0);
