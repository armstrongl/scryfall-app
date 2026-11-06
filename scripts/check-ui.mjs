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
const CONFIGS = process.env.ONLY ? [{ width: Number(process.env.ONLY), scheme: process.env.SCHEME ?? "light" }] : [
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
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)}).click()`;
const setValue = (selector, value, event = "input") => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
})()`;

/** Header, name, and nerd mode. */
async function shell(b, width, check) {
  const { ev } = b;
  check("the app is named Brewmancer", (await ev("document.title")) === "Brewmancer" && (await ev(`document.querySelector(".brand").textContent.trim()`)) === "Brewmancer");
  const toggle = "#density-toggle";
  check("nerd mode toggle exists and is off", (await ev(`document.querySelector("${toggle}")?.getAttribute("aria-pressed")`)) === "false");
  await ev(click(toggle));
  check("nerd mode turns on", (await ev(`document.querySelector("${toggle}").getAttribute("aria-pressed")`)) === "true"
    && (await ev(`document.documentElement.dataset.density`)) === "nerd");
  await ev(click(toggle));
  check("nerd mode turns off", (await ev(`document.documentElement.dataset.density`)) === "comfortable");
  if (width < 500) {
    check("phone: the view tabs are a bar fixed to the bottom", (await ev(`getComputedStyle(document.querySelector("nav.views")).position`)) === "fixed"
      && (await ev(`Math.abs(document.querySelector("nav.views").getBoundingClientRect().bottom - innerHeight) < 2`)),
      await ev(`JSON.stringify(document.querySelector("nav.views").getBoundingClientRect())`));
    check("phone: the brand is visible, not under the tab bar", await ev(`(() => {
      const r = document.querySelector(".brand").getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 5, r.top + r.height / 2);
      return !!hit && !!hit.closest(".brand");
    })()`));
  }
}

/** Filters, chips, draw, and the saved marker. */
async function discover(b, check) {
  const { ev, until } = b;
  check("Filters button shows and hides the filters", await (async () => {
    const before = await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded")`);
    await ev(click("#filters-toggle"));
    const after = await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded")`);
    return before !== after;
  })());
  check("active filters show as chips", await ev(`[...document.querySelectorAll(".chips .chip")].some((c) => /Standard/.test(c.textContent))`));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-brawl", "change"));
  await ev(clickText("#view-discover button", "Apply"));
  check("the Arena Brawl preset uses Brawl and color identity", await ev(`(() => {
    const q = document.querySelector("code.query").textContent;
    return /f:brawl/.test(q) && [...document.querySelectorAll(".chips .chip")].some((c) => /^Brawl/.test(c.textContent));
  })()`));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  await ev(clickText("#view-discover button", "Apply"));
  await ev(setValue("#view-discover textarea", "t:goblin t:creature"));
  check("raw query reaches the query preview", await until(`document.querySelector("code.query").textContent.includes("(t:goblin t:creature)")`, 3000));
  check("a raw query chip has a remove button", await ev(`[...document.querySelectorAll(".chips .chip button")].some((x) => /raw query/i.test(x.getAttribute("aria-label")))`));
  await until(`/match/.test(document.querySelector(".pool").textContent)`);
  await ev(click("#mode-draw"));
  await ev(clickText("#view-discover button", "Draw"));
  check("draw a Goblin creature", await until(`!!document.querySelector(".results .tile")`));
  const name = await ev(`document.querySelector(".results .tile .tile-name").textContent`);
  check("tile has Details, Explore, and Add", await ev(`(() => {
    const t = document.querySelector(".results .tile");
    return ["Details for", "Explore", "Add"].every((p) => [...t.querySelectorAll("button")].some((x) => (x.getAttribute("aria-label") ?? "").startsWith(p)));
  })()`));
  check("nothing sits on top of the card image", await ev(`(() => {
    const img = document.querySelector(".results .tile img");
    if (!img) return true;
    const r = img.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, innerHeight / 2 - r.top - 1));
    const s = getComputedStyle(img);
    return (hit === img || !hit || r.top > innerHeight) && s.filter === "none" && s.transform === "none" && s.objectFit !== "cover";
  })()`));

  // Add to a new list, then the tile says it's saved.
  await ev(`document.querySelector(".results .tile button[aria-label^='Add']").click()`);
  await sleep(300);
  await ev(`(() => {
    document.querySelector("dialog input[placeholder='Name of a new list']").value = "UI check";
    document.querySelector("dialog button[type=submit]").click();
  })()`);
  check("the tile shows where the card is saved", await until(`/Saved in UI check/.test(document.querySelector(".results .tile .tile-saved")?.textContent ?? "")`, 3000));
  return name;
}

/** Details sheet, hover inspector, and rulings button. */
async function details(b, width, name, check) {
  const { ev, until, key } = b;
  await ev(`document.querySelector(".results .tile button[aria-label^='Details for']").focus()`);
  const opener = await ev(FOCUS);
  await ev("document.activeElement.click()");
  await sleep(300);
  check("Details opens a sheet with the card name", (await ev(`document.querySelector("dialog[open] #details-title")?.textContent ?? ""`)) === name);
  check("details sheet has keywords, legality, and links", await ev(`(() => {
    const d = document.querySelector("dialog[open]");
    return !!d.querySelector(".legal-list") && [...d.querySelectorAll("a")].some((a) => /scryfall\.com/.test(a.href));
  })()`));
  check("details sheet has a Show rulings button", await ev(`[...document.querySelectorAll("dialog[open] button")].some((x) => x.textContent.trim() === "Show rulings")`));
  check("focus starts inside the sheet", await ev(`document.querySelector("dialog[open]")?.contains(document.activeElement) ?? false`));
  await key("Escape", 27);
  await sleep(300);
  check("Escape closes the sheet and returns focus", (await ev(`document.querySelectorAll("dialog").length === 0`)) && (await ev(FOCUS)) === opener, await ev(FOCUS));
  if (width >= 1200) {
    await ev(`document.querySelector(".results .tile").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))`);
    check("hovering a card fills the inspector", await until(`(document.querySelector("#inspector h2")?.textContent ?? "") === ${JSON.stringify(name)}`, 2000));
    check("the inspector doesn't cover any card image", await ev(`(() => {
      const box = document.querySelector("#inspector").getBoundingClientRect();
      return [...document.querySelectorAll(".results .tile img")].every((img) => {
        const r = img.getBoundingClientRect();
        return r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom;
      });
    })()`));
  } else {
    check("no inspector on narrow screens", await ev(`(() => { const i = document.querySelector("#inspector"); return !i || getComputedStyle(i).display === "none"; })()`));
  }
}

/** Explore: tabs, keyboard, and the trip to Browse. */
async function exploreFlow(b, check) {
  const { ev, until, key } = b;
  await ev(`document.querySelector(".results .tile button[aria-label^='Explore']").click()`);
  await sleep(300);
  check("Explore opens with three tabs", (await ev(`[...document.querySelectorAll("dialog[open] [role=tab]")].map((t) => t.firstChild.textContent.trim()).join("|")`)) === "Synergies|Similar|Counters");
  check("the Synergies tab is selected", (await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").firstChild.textContent.trim()`)) === "Synergies");
  await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").focus()`);
  await key("ArrowRight", 39);
  check("ArrowRight moves to the Similar tab", (await ev(`document.activeElement.firstChild.textContent.trim()`)) === "Similar"
    && (await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").firstChild.textContent.trim()`)) === "Similar");
  await key("ArrowRight", 39);
  check("Counters tab lists answers", await ev(`document.querySelectorAll("dialog[open] [role=tabpanel]:not([hidden]) .suggestion").length > 0`));
  await key("ArrowLeft", 37);
  await key("ArrowLeft", 37);
  await sleep(100);
  if (!(await ev(`!!document.querySelector("dialog[open] [role=tabpanel]:not([hidden]) .suggestion button")`))) {
    check("the card has a synergy (needed for the next checks)", false);
    await key("Escape", 27);
    return;
  }
  await ev(`document.querySelector("dialog[open] [role=tabpanel]:not([hidden]) .suggestion button").click()`);
  await sleep(300);
  check("Search loads the query without the card itself", (await ev(`document.querySelector("code.query").textContent`)).includes(' -!"'));
  check("Search switches to Browse", (await ev(`document.querySelector("#mode-browse").getAttribute("aria-pressed")`)) === "true");
  check("Discover explains where the search came from", /Cards that may work with|Similar to|Answers to/.test(await ev(`document.querySelector(".draw-notes").textContent`)));
  const browsed = await until(`/Showing|No cards/.test(document.querySelector(".browse-status")?.textContent ?? "")`, 30000);
  check("Browse shows the results", browsed, await ev(`document.querySelector(".browse-status")?.textContent`));
}

/** Browse with a sort order. */
async function browse(b, check) {
  const { ev, until } = b;
  await ev(setValue("#view-discover textarea", "t:goblin t:creature"));
  await ev(click("#mode-browse"));
  check("Browse has sort and direction", await ev(`!!document.querySelector("#browse-sort") && !!document.querySelector("#browse-dir")`));
  await ev(setValue("#browse-sort", "cmc", "change"));
  await ev(setValue("#browse-dir", "desc", "change"));
  await ev(clickText("#view-discover button", "Show cards"));
  check("Browse lists matching cards", await until(`document.querySelectorAll(".results .tile").length > 1`, 30000));
  const mvs = await ev(`[...document.querySelectorAll(".results .tile")].map((t) => Number(t.dataset.mv))`);
  check("cards come in the chosen order", mvs.every((v, i) => i === 0 || v <= mvs[i - 1]), mvs.join(","));
  check("Browse says how many it shows", /Showing \d+ of \d+/.test(await ev(`document.querySelector(".browse-status").textContent`)));
}

/** Lists: Export, Open on Scryfall, undo, Brawl, and stats. */
async function lists(b, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#lists"`);
  await sleep(800);
  const href = await ev(`[...document.querySelectorAll("a")].find((a) => a.textContent.includes("UI check"))?.getAttribute("href")`);
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await sleep(800);
  check("Export for Arena is the main button", await ev(`[...document.querySelectorAll("#view-lists button.primary")].some((x) => x.textContent.trim() === "Export for Arena")`));
  check("Open on Scryfall links to a Scryfall search", await ev(`[...document.querySelectorAll("#view-lists a")].some((a) => a.textContent.startsWith("Open on Scryfall") && a.href.startsWith("https://scryfall.com/search"))`));
  await ev(clickText("#view-lists button", "Export for Arena"));
  await sleep(300);
  check("export text has the card", /^1 \S/.test(await ev(`document.querySelector("textarea[aria-label='Arena deck text']")?.value ?? ""`)));
  await ev(setValue("#kind-select", "deck", "change"));
  await sleep(500);
  check("deck stats show for a deck", await ev(`!!document.querySelector(".deck-stats .curve")`));
  await ev(setValue("#format-select", "brawl", "change"));
  await sleep(500);
  check("Brawl checks replace Standard checks", /Brawl deck checks/.test(await ev(`document.querySelector("#checks-title")?.textContent ?? ""`)));
  check("Brawl lists have a Commander section", await ev(`!!document.querySelector("#sec-commander")`));
  const before = await ev(`document.querySelectorAll(".entry").length`);
  await ev(`document.querySelector(".entry button[aria-label^='Remove']").click()`);
  await sleep(500);
  check("Remove takes the card out", (await ev(`document.querySelectorAll(".entry").length`)) === before - 1);
  check("an Undo button appears", await until(`[...document.querySelectorAll("#toast button")].some((x) => x.textContent.trim() === "Undo")`, 2000));
  await ev(clickText("#toast button", "Undo"));
  check("Undo puts the card back", await until(`document.querySelectorAll(".entry").length === ${before}`, 3000));
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
    await shell(b, width, check);
    const name = await discover(b, check);
    await details(b, width, name, check);
    await exploreFlow(b, check);
    await browse(b, check);
    await lists(b, check);
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
