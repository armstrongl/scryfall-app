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
  /** @type {Map<string, (params: any) => void>} */
  const handlers = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method && handlers.has(m.method)) handlers.get(m.method)(m.params);
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
  const on = (method, fn) => handlers.set(method, fn);
  return { send, ev, until, key, on, errors, close: () => ws.close() };
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

/** The current search, read from the Open on Scryfall link (the page no longer shows the query). */
const QUERY = `new URL(document.querySelector("#open-scryfall").href).searchParams.get("q")`;
const CHIPS = `[...document.querySelectorAll(".chips .chip")].map((c) => c.textContent).join(" | ")`;

/** Moves the mouse to the middle of an element, so CSS :hover applies. */
async function hover(b, selector) {
  const r = await b.ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
}

/** The tooltip that a control points to with aria-describedby. */
const TIP_OF = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)).find((t) => t?.getAttribute("role") === "tooltip")`;
const tipOpen = (sel) => `(() => { const t = ${TIP_OF(sel)}; return !!t && getComputedStyle(t).display !== "none" && t.getBoundingClientRect().width > 0; })()`;
/** The open tooltip is inside the screen and covers no card image. */
const tipPlaced = (sel) => `(() => {
  const t = ${TIP_OF(sel)}.getBoundingClientRect();
  const imgs = [...document.querySelectorAll(".card-media img, .card-media .card-text")].map((i) => i.getBoundingClientRect()).filter((r) => r.width > 0);
  return t.left >= 0 && t.right <= innerWidth && imgs.every((r) => r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom);
})()`;
const mouseAway = (b) => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 899 });

/**
 * Every tooltip in a scope: buttons show theirs on hover and on keyboard
 * focus, and ? buttons also on click. Each stays inside the screen, covers
 * no card image, and hides on Escape.
 */
async function tooltipsIn(b, scope, label, check) {
  const { ev, until, key } = b;
  const count = await ev(`(() => {
    document.querySelectorAll("[data-tip-test]").forEach((el) => { delete el.dataset.tipTest; });
    const els = [...document.querySelectorAll(${JSON.stringify(scope)} + " [aria-describedby]")].filter((el) => el.getClientRects().length > 0
      && el.getAttribute("aria-describedby").split(" ").some((id) => document.getElementById(id)?.getAttribute("role") === "tooltip"));
    els.forEach((el, i) => { el.dataset.tipTest = String(i); });
    return els.length;
  })()`);
  const bad = [];
  for (let i = 0; i < count; i++) {
    const sel = `[data-tip-test="${i}"]`;
    const name = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el.getAttribute("aria-label") ?? el.textContent.trim(); })()`);
    const info = await ev(`document.querySelector(${JSON.stringify(sel)}).classList.contains("info-tip")`);
    await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
    if (await ev(tipOpen(sel))) bad.push(`${name}: open before use`);
    if (info) {
      if (!/^About /.test(name)) bad.push(`${name}: a ? button is named "About …"`);
      // The tap target is as wide as --tap (44px on touch screens), more than the circle that shows.
      const wide = await ev(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        const half = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap")) / 2 - 1;
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2;
        return [-half, half].every((dx) => el.contains(document.elementFromPoint(r.left + r.width / 2 + dx, y)));
      })()`);
      if (!wide) bad.push(`${name}: tap target narrower than --tap`);
      await ev(click(sel));
      if (!(await until(tipOpen(sel), 1000))) bad.push(`${name}: click doesn't open it`);
      else if (!(await ev(tipPlaced(sel)))) bad.push(`${name}: off screen or over a card`);
      await ev(click(sel));
      if (await ev(tipOpen(sel))) bad.push(`${name}: a second click doesn't close it`);
    } else {
      await hover(b, sel);
      if (!(await until(tipOpen(sel), 1000))) bad.push(`${name}: hover doesn't open it`);
      else if (!(await ev(tipPlaced(sel)))) bad.push(`${name}: off screen or over a card`);
      await mouseAway(b);
      if (!(await until(`!${tipOpen(sel)}`, 1000))) bad.push(`${name}: doesn't close when the pointer leaves`);
    }
    await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
    if (!(await until(tipOpen(sel), 1000))) bad.push(`${name}: keyboard focus doesn't open it`);
    await key("Escape", 27);
    if (await ev(tipOpen(sel))) bad.push(`${name}: Escape doesn't close it`);
    await ev(`document.activeElement.blur()`);
  }
  await ev(`window.scrollTo(0, 0)`);
  check(`${label}: tooltips open on hover, focus, or click, stay on screen, cover no card, and close`, count > 0 && bad.length === 0, count ? bad.join("; ") : "no tooltips");
  return count;
}

/** Tooltips in Discover, with cards on the screen. */
async function discoverTips(b, check) {
  const { ev } = b;
  const open = await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded") === "true"`);
  if (!open) await ev(click("#filters-toggle"));
  check("the filters have ? buttons that explain them", (await ev(`document.querySelectorAll("#filters-panel .info-tip").length`)) >= 8,
    await ev(`[...document.querySelectorAll("#filters-panel .info-tip")].map((x) => x.getAttribute("aria-label")).join(", ")`));
  check("the filters link to their help page", await ev(`!!document.querySelector("#filters-panel a[href='#help/find-cards']")`));
  const n = await tooltipsIn(b, "#view-discover", "Discover", check);
  check("a ? button in a legend doesn't join the group's name", await ev(`[...document.querySelectorAll("fieldset")].filter((f) => f.querySelector(":scope > legend button")).every((f) => {
    const name = document.getElementById(f.getAttribute("aria-labelledby") ?? "")?.textContent ?? "";
    return name !== "" && !/About|[?]/.test(name);
  })`));
  // A ? button opened by keyboard focus closes on Enter.
  await ev(`document.querySelector("#filters-panel .info-tip").focus()`);
  await b.until(tipOpen("#filters-panel .info-tip"), 1000);
  for (const type of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: type === "keyDown" ? "\r" : undefined });
  check("Enter closes a ? tooltip that focus opened", !(await ev(tipOpen("#filters-panel .info-tip"))));
  await ev(`document.activeElement.blur()`);
  // A button's tooltip closes when the button is used, so new cards never appear under it.
  await ev(`document.querySelector("#view-discover .preset-row button:nth-child(2) button, #view-discover .preset-row .tip-wrap:nth-child(2) button").id = "save-preset-test"`);
  await hover(b, "#save-preset-test");
  await b.until(tipOpen("#save-preset-test"), 1000);
  await ev(click("#save-preset-test"));
  check("clicking a button closes its tooltip", !(await ev(tipOpen("#save-preset-test"))));
  await ev(clickText("#view-discover .preset-slot button", "Cancel"));
  await mouseAway(b);
  check("Discover has tooltips on its buttons and filters", n >= 12, String(n));
}

/** Header, name, nerd mode, and the clean look. */
async function shell(b, width, check) {
  const { ev } = b;
  check("the app is named Cascade", (await ev("document.title")) === "Cascade" && (await ev(`document.querySelector(".brand").textContent.trim()`)) === "Cascade",
    await ev("document.title"));
  check("the old name is gone from the page", !(await ev(`/Brewmancer/.test(document.documentElement.outerHTML)`)));
  const toggle = "#density-toggle";
  // Nerd mode tooltip: on hover and on focus, described for screen readers, closed by Escape.
  const tipVisible = `(() => { const t = document.getElementById(document.querySelector("${toggle}").getAttribute("aria-describedby") ?? ""); return !!t && t.getAttribute("role") === "tooltip" && getComputedStyle(t).display !== "none" && t.getBoundingClientRect().width > 0; })()`;
  check("nerd mode has a tooltip, hidden at first", (await ev(`!!document.getElementById(document.querySelector("${toggle}").getAttribute("aria-describedby") ?? "")`)) && !(await ev(tipVisible)));
  check("nerd mode has no second, native tooltip", (await ev(`document.querySelector("${toggle}").hasAttribute("title")`)) === false);
  await hover(b, toggle);
  check("hovering nerd mode shows the tooltip", await b.until(tipVisible, 2000));
  check("the tooltip says what nerd mode shows", /mana value.*price.*legality/is.test(await ev(`document.getElementById("nerd-tip").textContent`)));
  check("the tooltip stays inside the screen", await ev(`(() => { const r = document.getElementById("nerd-tip").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`));
  await b.key("Escape", 27);
  check("Escape hides the tooltip", !(await ev(tipVisible)));
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 899 });
  await ev(`document.querySelector("${toggle}").focus()`);
  check("keyboard focus shows the tooltip", await b.until(tipVisible, 2000));
  await ev(`document.activeElement.blur()`);
  check("the tooltip hides when focus leaves", !(await ev(tipVisible)));
  check("nerd mode toggle exists and is off", (await ev(`document.querySelector("${toggle}")?.getAttribute("aria-pressed")`)) === "false");
  await ev(click(toggle));
  check("nerd mode turns on", (await ev(`document.querySelector("${toggle}").getAttribute("aria-pressed")`)) === "true"
    && (await ev(`document.documentElement.dataset.density`)) === "nerd");
  await ev(click(toggle));
  check("nerd mode turns off", (await ev(`document.documentElement.dataset.density`)) === "comfortable");
  check("the views include Help", await ev(`[...document.querySelectorAll("nav.views a")].map((a) => a.textContent.trim()).join("|") === "Discover|Lists|Data|Help"`));
  check("clean look: system font, no page gradient, small corners on buttons", await ev(`(() => {
    const body = getComputedStyle(document.body);
    const btn = getComputedStyle(document.querySelector("#filters-toggle"));
    return /-apple-system|system-ui/.test(body.fontFamily) && !/gradient/.test(body.backgroundImage) && parseFloat(btn.borderTopLeftRadius) <= 8;
  })()`));
  if (width < 500) {
    check("phone: the view tabs are in the header and never float over the page", await ev(`(() => {
      const nav = document.querySelector("nav.views");
      const pos = getComputedStyle(nav).position;
      return pos !== "fixed" && pos !== "sticky" && document.querySelector(".site-header").contains(nav)
        && getComputedStyle(document.querySelector(".site-header")).position !== "sticky";
    })()`));
    check("phone: the brand is visible", await ev(`(() => {
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
  check("the full query isn't shown, and there's no Copy query button", await ev(`!document.querySelector("#view-discover code") && ![...document.querySelectorAll("#view-discover button")].some((x) => /copy query/i.test(x.textContent))`));
  check("Open on Scryfall opens the current search", await ev(`(() => { const a = document.querySelector("#open-scryfall"); return !!a && a.textContent.trim() === "Open on Scryfall" && a.href.startsWith("https://scryfall.com/search?q=") && a.target === "_blank"; })()`));
  check("Draw allows up to 30 cards", (await ev(`document.querySelector("#draw-count").max`)) === "30");
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-brawl", "change"));
  await ev(clickText("#view-discover button", "Apply"));
  check("the Arena Brawl preset uses Brawl and color identity", /f:brawl/.test(await ev(QUERY))
    && await ev(`[...document.querySelectorAll(".chips .chip")].some((c) => /^Brawl/.test(c.textContent))`));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  await ev(clickText("#view-discover button", "Apply"));
  await ev(setValue("#view-discover textarea", "t:goblin t:creature"));
  check("a Scryfall search reaches the query", await until(`${QUERY}.includes("(t:goblin t:creature)")`, 3000));
  check("a typed search shows as a Custom search chip with a remove button", await ev(`[...document.querySelectorAll(".chips .chip button")].some((x) => /Custom search/.test(x.getAttribute("aria-label")))`), await ev(CHIPS));
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
    img.scrollIntoView({ block: "center" });
    const r = img.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const s = getComputedStyle(img);
    window.scrollTo(0, 0);
    return hit === img && s.filter === "none" && s.transform === "none" && s.objectFit !== "cover";
  })()`));

  // Add to a new list, then the tile says it's saved.
  await ev(`document.querySelector(".results .tile button[aria-label^='Add']").click()`);
  await sleep(300);
  await ev(`(() => {
    document.querySelector("dialog input[placeholder='Name of a new list']").value = "UI check";
    document.querySelector("dialog button[type=submit]").click();
  })()`);
  check("the tile shows where the card is saved", await until(`/Saved in UI check/.test(document.querySelector(".results .tile .tile-saved")?.textContent ?? "")`, 3000));
  await redraw(b, check);
  // The redraw replaced the cards, so the later checks use the new first card.
  return await ev(`document.querySelector(".results .tile .tile-name").textContent`) ?? name;
}

/**
 * Redraws prefer cards that weren't drawn recently for the same search. A
 * small pool (175 cards or fewer) is drawn from one search page, so a redraw
 * with enough new cards repeats none, and it sends no random-card requests.
 */
async function redraw(b, check) {
  const { ev, until } = b;
  const names = `[...document.querySelectorAll(".results .tile .tile-name")].map((n) => n.textContent)`;
  const pool = Number((await ev(`document.querySelector(".pool strong")?.textContent ?? "0"`)).replace(/\D/g, ""));
  if (!(pool >= 4 && pool <= 175)) {
    check("the goblin pool is small enough for the redraw check", false, `pool ${pool}`);
    return;
  }
  const first = await ev(names);
  const count = Math.min(10, Math.floor((pool - first.length) / 2));
  await ev(setValue("#draw-count", String(count)));
  const randomBefore = await ev(`performance.getEntriesByType("resource").filter((r) => r.name.includes("/cards/random")).length`);
  await ev(clickText("#view-discover button", "Draw"));
  await until(`${names}.length === ${count} && !document.querySelector("#draw-btn").disabled`, 20000);
  const second = await ev(names);
  await ev(clickText("#view-discover button", "Draw"));
  await until(`${names}.length === ${count} && !document.querySelector("#draw-btn").disabled`, 20000);
  const third = await ev(names);
  const overlap = (a, c) => a.filter((n) => c.includes(n));
  check("a redraw repeats no recent card while new ones are left", second.length === count && overlap(second, first).length === 0, `${overlap(second, first).join(", ")}`);
  check("the next redraw skips both earlier draws", third.length === count && overlap(third, [...first, ...second]).length === 0, `${overlap(third, [...first, ...second]).join(", ")}`);
  check("a small pool draws without random-card requests", (await ev(`performance.getEntriesByType("resource").filter((r) => r.name.includes("/cards/random")).length`)) === randomBefore);
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
  check("details sheet links to the card's combos on Commander Spellbook", await ev(`[...document.querySelectorAll("dialog[open] a")].some((a) => a.textContent.trim() === "Combos on Commander Spellbook" && a.href.startsWith("https://commanderspellbook.com/search/?q=") && a.target === "_blank")`));
  check("details sheet links to the Glossary", await ev(`!!document.querySelector("dialog[open] a[href='#help/glossary']")`));
  check("details sheet has a Show rulings button", await ev(`[...document.querySelectorAll("dialog[open] button")].some((x) => x.textContent.trim() === "Show rulings")`));
  check("focus starts inside the sheet", await ev(`document.querySelector("dialog[open]")?.contains(document.activeElement) ?? false`));
  // Rulings: one request per card, even if the sheet is reopened while it runs.
  await ev(clickText("dialog[open] button", "Show rulings"));
  await ev(clickText("dialog[open] button", "Close"));
  await ev(`document.querySelector(".results .tile button[aria-label^='Details for']").click()`);
  await until(`!document.querySelector("dialog[open] .rulings button")`, 10000);
  check("rulings are requested once per card", (await ev(`performance.getEntriesByType("resource").filter((r) => r.name.includes("/rulings")).length`)) === 1,
    await ev(`performance.getEntriesByType("resource").filter((r) => r.name.includes("/rulings")).length`));
  check("rulings show after reopening", await ev(`!!document.querySelector("dialog[open] .rulings ul, dialog[open] .rulings .hint")`));
  await ev(`document.querySelector(".results .tile button[aria-label^='Details for']").focus()`);
  await ev(clickText("dialog[open] button", "Close"));
  await ev("document.activeElement.click()");
  await sleep(300);
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
  check("the Explore button's label names all four tabs", /synergies, similar cards, counters, and combos/.test(await ev(`document.querySelector(".results .tile button[aria-label^='Explore']").getAttribute("aria-label")`)));
  check("Explore opens with four tabs", (await ev(`[...document.querySelectorAll("dialog[open] [role=tab]")].map((t) => t.firstChild.textContent.trim()).join("|")`)) === "Synergies|Similar|Counters|Combos");
  check("Explore links to its help page", await ev(`[...document.querySelectorAll("dialog[open] a[href='#help/explore']")].some((a) => /^Learn more/.test(a.textContent.trim()))`));
  check("Explore shows no query syntax", await ev(`!document.querySelector("dialog[open] code")`));
  check("the Synergies tab is selected", (await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").firstChild.textContent.trim()`)) === "Synergies");
  await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").focus()`);
  await key("ArrowRight", 39);
  check("ArrowRight moves to the Similar tab", (await ev(`document.activeElement.firstChild.textContent.trim()`)) === "Similar"
    && (await ev(`document.querySelector("dialog[open] [role=tab][aria-selected=true]").firstChild.textContent.trim()`)) === "Similar");
  await key("ArrowRight", 39);
  check("Counters tab lists answers", await ev(`document.querySelectorAll("dialog[open] [role=tabpanel]:not([hidden]) .suggestion").length > 0`));
  await key("ArrowRight", 39);
  check("the Combos tab links to Commander Spellbook in a new tab", await ev(`(() => {
    const links = [...document.querySelectorAll("dialog[open] [role=tabpanel]:not([hidden]) .suggestion a")];
    return links.length > 0 && links.every((a) => a.href.startsWith("https://commanderspellbook.com/search/?q=") && a.target === "_blank" && a.rel.includes("noopener") && /Commander Spellbook/.test(a.getAttribute("aria-label") ?? ""));
  })()`));
  check("the Combos tab shows no query syntax", await ev(`!/card=|legal:|coloridentity/.test(document.querySelector("dialog[open] [role=tabpanel]:not([hidden])").textContent)`));
  await key("ArrowLeft", 37);
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
  check("Search loads the query without the card itself", (await ev(QUERY)).includes(' -!"'));
  check("the Explore chip says where the search came from, not the query", await ev(`[...document.querySelectorAll(".chips .chip")].some((c) => /^(Works with|Similar to|Answers to) /.test(c.textContent) && !/otag:|-!/.test(c.textContent))`), await ev(CHIPS));
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
  // Switching to Draw while Browse is loading cancels the load: no browse
  // cards appear in the Draw view.
  await ev(setValue("#browse-sort", "name", "change"));
  await ev(setValue("#browse-dir", "asc", "change"));
  await ev(clickText("#view-discover button", "Show cards"));
  await ev(click("#mode-draw"));
  await sleep(4000);
  check("switching to Draw cancels a Browse load", (await ev(`document.querySelectorAll(".results .tile").length`)) === 0);
  check("the Cancel button is hidden after the switch", await ev(`[...document.querySelectorAll("#view-discover button")].find((x) => x.textContent.trim() === "Cancel").hidden`));
  await ev(click("#mode-browse"));
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
  await ev(clickText("#view-lists button", "Find combos"));
  await sleep(300);
  check("Find combos shows the list as decklist text", /^1 \S/.test(await ev(`document.querySelector("textarea[aria-label='Decklist for Commander Spellbook']")?.value ?? ""`)));
  check("Find combos has Copy and a link to Find My Combos", await ev(`[...document.querySelectorAll("#view-lists .panel-box button")].some((x) => x.textContent.trim() === "Copy")
    && [...document.querySelectorAll("#view-lists .panel-box a")].some((a) => a.href === "https://commanderspellbook.com/find-my-combos/" && a.target === "_blank")`));
  check("Find combos links to the Combos help page", await ev(`!!document.querySelector("#view-lists .panel-box a[href='#help/combos']")`));
  check("focus moves to Copy in the Find combos panel", await ev(`document.activeElement?.textContent.trim() === "Copy" && !!document.activeElement.closest(".panel-box")`), await ev(FOCUS));
  await ev(clickText("#view-lists .panel-box button", "Close"));
  await sleep(200);
  check("closing Find combos returns focus to it", await ev(`document.activeElement?.textContent.trim() === "Find combos"`), await ev(FOCUS));
  await ev(clickText("#view-lists button", "More"));
  await ev(clickText("#list-more button", "Refresh card data"));
  await until(`!/Refreshing/.test(document.querySelector("#view-lists").textContent)`, 15000);
  await sleep(300);
  check("after More, then Refresh, focus goes back to More", await ev(`document.activeElement?.id === "list-more-btn"`), await ev(FOCUS));
  await ev(setValue("#kind-select", "deck", "change"));
  await sleep(500);
  check("deck stats show for a deck", await ev(`!!document.querySelector(".deck-stats .curve")`));
  await ev(setValue("#format-select", "brawl", "change"));
  await sleep(500);
  check("Brawl checks replace Standard checks", /Brawl deck checks/.test(await ev(`document.querySelector("#checks-title")?.textContent ?? ""`)));
  check("deck checks link to their help page", await ev(`!!document.querySelector("#view-lists a[href='#help/lists-and-decks']")`));
  await tooltipsIn(b, "#view-lists", "Lists", check);
  // A ? tooltip that's open when the view re-renders must not swallow the next Escape.
  await ev(`document.querySelector("#view-lists .toolbar .info-tip").click()`);
  await ev(setValue("#format-select", "standardbrawl", "change"));
  await sleep(500);
  await ev(setValue("#format-select", "brawl", "change"));
  await sleep(500);
  await ev(`document.querySelector(".entry button[aria-label^='Explore']").click()`);
  await sleep(300);
  await b.key("Escape", 27);
  await sleep(200);
  check("Escape still closes a dialog after a re-render removed an open tooltip", await ev(`!document.querySelector("dialog[open]")`));
  check("Brawl lists have a Commander section", await ev(`!!document.querySelector("#sec-commander")`));
  const before = await ev(`document.querySelectorAll(".entry").length`);
  await ev(`document.querySelector(".entry button[aria-label^='Remove']").click()`);
  await sleep(500);
  check("Remove takes the card out", (await ev(`document.querySelectorAll(".entry").length`)) === before - 1);
  check("an Undo button appears where the card was", await until(`[...document.querySelectorAll("#view-lists .removed button")].some((x) => x.textContent.trim() === "Undo")`, 2000));
  check("focus moves to Undo", await until(`document.activeElement?.textContent.trim() === "Undo"`, 1000));
  await ev(clickText("#view-lists .removed button", "Undo"));
  check("Undo puts the card back", await until(`document.querySelectorAll(".entry").length === ${before}`, 3000));
  await ev(`document.querySelector(".entry button[aria-label^='Remove']").click()`);
  await until(`!!document.querySelector("#view-lists .removed")`, 2000);
  await ev(`[...document.querySelectorAll("#view-lists .removed button")].find((x) => x.textContent.trim() === "Dismiss").click()`);
  await sleep(300);
  check("Dismiss moves focus to the list heading", await ev(`document.activeElement?.id === "lists-title"`), await ev(FOCUS));
  check("no toast or bar floats over the page", await ev(`[...document.querySelectorAll("body *")].every((n) => !["fixed", "sticky"].includes(getComputedStyle(n).position) || n.closest("dialog") || n.id === "inspector" || n.classList.contains("skip"))`),
    await ev(`[...document.querySelectorAll("body *")].filter((n) => ["fixed", "sticky"].includes(getComputedStyle(n).position)).map((n) => n.tagName + "." + n.className).join(", ")`));
}

/** Data: the storage tooltip and the link to its help page. */
async function data(b, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#data"`);
  await until(`!document.querySelector("#view-data").hidden`, 3000);
  check("Data links to the Your data help page", await ev(`!!document.querySelector("#view-data a[href='#help/your-data']")`));
  await tooltipsIn(b, "#view-data", "Data", check);
}

/** A ? button in a dialog: Escape closes the tooltip first, then the dialog. */
async function dialogTip(b, check) {
  const { ev, until, key } = b;
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  await ev(`document.querySelector(".results .tile button[aria-label^='Add']").click()`);
  await sleep(300);
  const sel = "dialog[open] .info-tip";
  check("the Add panel explains its sections", await ev(`!!document.querySelector(${JSON.stringify(sel)})`));
  await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
  await until(tipOpen(sel), 1000);
  await key("Escape", 27);
  check("Escape closes the tooltip and keeps the Add panel open", !(await ev(tipOpen(sel))) && (await ev(`!!document.querySelector("dialog[open]")`)));
  await key("Escape", 27);
  await sleep(200);
  check("a second Escape closes the Add panel", await ev(`!document.querySelector("dialog[open]")`));
}

/** Learn more in Explore closes the panel and opens the Explore help page. */
async function learnMore(b, check) {
  const { ev, until } = b;
  await ev(`document.querySelector(".results .tile button[aria-label^='Explore']").click()`);
  await sleep(300);
  await ev(`document.querySelector("dialog[open] a[href='#help/explore']").click()`);
  check("Learn more closes Explore and opens its help page", await until(`!document.querySelector("dialog[open]") && document.querySelector("#help-page-title")?.textContent === "Explore" && !document.querySelector("#view-help").hidden`, 3000));
}

/** Help: the pages built into the app. */
async function help(b, check) {
  const { ev, until } = b;
  await ev(clickText("nav.views a", "Help"));
  check("Help opens", await until(`location.hash.startsWith("#help") && !document.querySelector("#view-help").hidden`, 3000));
  check("Help lists its pages", await ev(`document.querySelectorAll("#view-help .help-nav a").length >= 6`));
  check("Help has a Combos page", await ev(`[...document.querySelectorAll("#view-help .help-nav a")].some((a) => a.textContent.trim() === "Combos")`));
  check("Help starts on Get started", (await ev(`document.querySelector("#help-page-title")?.textContent`)) === "Get started");
  await ev(`[...document.querySelectorAll("#view-help .help-nav a")].find((a) => a.textContent.trim() === "Nerd mode").click()`);
  check("a Help link opens its page", await until(`document.querySelector("#help-page-title")?.textContent === "Nerd mode"`, 3000));
  check("focus moves to the page heading", await until(`document.activeElement?.id === "help-page-title"`, 1000), await ev(FOCUS));
  check("the Nerd mode page matches the tooltip", await ev(`document.querySelector("#view-help article").textContent.includes(document.getElementById("nerd-tip").textContent)`));
  check("the current page is marked in the Help list", (await ev(`document.querySelector("#view-help .help-nav a[aria-current=page]")?.textContent.trim()`)) === "Nerd mode");
  await ev(`location.hash = "#help/explore"`);
  check("a link straight to a Help page works", await until(`document.querySelector("#help-page-title")?.textContent === "Explore"`, 3000));
  check("Help marks UI labels in bold", await ev(`!!document.querySelector("#view-help article strong")`));
  check("Help links open other sites in a new tab, and say so", await ev(`(() => {
    const links = [...document.querySelectorAll("#view-help article a[href^='https://']")];
    return links.length > 0 && links.every((a) => a.target === "_blank" && a.rel.includes("noopener") && /opens in a new tab/.test(a.querySelector(".visually-hidden")?.textContent ?? ""));
  })()`));
  await ev(`document.querySelector("#view-help article a[href='#help/combos']")?.click()`);
  check("a link to another help page opens it", await until(`document.querySelector("#help-page-title")?.textContent === "Combos"`, 3000));
  check("focus moves to the linked page's heading", await until(`document.activeElement?.id === "help-page-title"`, 1000), await ev(FOCUS));
  check("Help has a Glossary page", await ev(`[...document.querySelectorAll("#view-help .help-nav a")].some((a) => a.textContent.trim() === "Glossary")`));
  check("Help has no horizontal scroll", !(await ev("document.documentElement.scrollWidth > window.innerWidth")));
}

// Fake GitHub ----------------------------------------------------------------------
// The checks never reach GitHub. Chrome hands every request to api.github.com
// to this script through the DevTools Fetch domain, and the script answers
// it from one fake private repository, "me/cards", that holds the sync file.
// The answers have the fields the app reads, in the shape of the real
// responses in tests/fixtures/github-*.json.

const GH_TOKEN = "check-ui-token";
const GH_FILE = "card-discovery-sync.json";
const CORS = [
  { name: "Access-Control-Allow-Origin", value: "*" },
  { name: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, X-GitHub-Api-Version" },
  { name: "Access-Control-Allow-Methods", value: "GET, PUT" },
  { name: "Content-Type", value: "application/json" },
];

async function fakeGitHub(b) {
  const gh = {
    file: null, // { text, sha }
    files: new Map(), // Other files, such as backups, by path.
    shas: 0,
    requests: [],
    put(text) {
      gh.file = { text, sha: `sha-${++gh.shas}` };
    },
    remote: () => (gh.file ? JSON.parse(gh.file.text) : null),
  };
  const reply = (requestId, status, body) => b.send("Fetch.fulfillRequest", {
    requestId,
    responseCode: status,
    responseHeaders: CORS,
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)).toString("base64"),
  });
  b.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const url = new URL(request.url);
    const auth = request.headers.Authorization ?? request.headers.authorization;
    gh.requests.push({ method: request.method, path: url.pathname, headers: request.headers });
    if (request.method === "OPTIONS") return reply(requestId, 204);
    if (auth !== `Bearer ${GH_TOKEN}`) return reply(requestId, 401, { message: "Bad credentials", status: "401" });
    if (url.pathname === "/repos/me/cards") return reply(requestId, 200, { name: "cards", full_name: "me/cards", private: true });
    const prefix = "/repos/me/cards/contents/";
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    if (url.pathname.startsWith(prefix) && path !== GH_FILE) {
      // Files in the backups folder, and the folder listing.
      if (request.method === "GET") {
        const f = gh.files.get(path);
        if (f) return reply(requestId, 200, { name: path.split("/").pop(), path, sha: f.sha, encoding: "base64", content: Buffer.from(f.text).toString("base64") });
        const inDir = [...gh.files.keys()].filter((k) => k.startsWith(`${path}/`));
        if (!inDir.length) return reply(requestId, 404, { message: "Not Found", status: "404" });
        return reply(requestId, 200, inDir.map((k) => ({ name: k.split("/").pop(), path: k, sha: gh.files.get(k).sha, type: "file" })));
      }
      if (request.method === "PUT") {
        const body = JSON.parse(request.postData ?? "{}");
        gh.files.set(path, { text: Buffer.from(body.content, "base64").toString("utf8"), sha: `sha-${++gh.shas}` });
        return reply(requestId, 201, { content: { name: path.split("/").pop(), path, sha: gh.files.get(path).sha }, commit: {} });
      }
    }
    if (url.pathname !== `/repos/me/cards/contents/${GH_FILE}`) return reply(requestId, 404, { message: "Not Found", status: "404" });
    if (request.method === "GET") {
      if (!gh.file) return reply(requestId, 404, { message: "Not Found", status: "404" });
      return reply(requestId, 200, {
        name: GH_FILE, path: GH_FILE, sha: gh.file.sha, encoding: "base64",
        content: Buffer.from(gh.file.text).toString("base64").replace(/(.{60})/g, "$1\n"),
      });
    }
    if (request.method === "PUT") {
      const body = JSON.parse(request.postData ?? "{}");
      if ((gh.file?.sha ?? undefined) !== body.sha) return reply(requestId, 409, { message: "Conflict" });
      gh.put(Buffer.from(body.content, "base64").toString("utf8"));
      return reply(requestId, 200, { content: { name: GH_FILE, path: GH_FILE, sha: gh.file.sha }, commit: {} });
    }
    return reply(requestId, 404, { message: "Not Found", status: "404" });
  });
  await b.send("Fetch.enable", { patterns: [{ urlPattern: "https://api.github.com/*", requestStage: "Request" }] });
  return gh;
}

/** Sync with GitHub, in Data. */
async function sync(b, gh, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#data"`);
  await until(`!document.querySelector("#view-data").hidden`, 3000);
  check("Data has a Sync with GitHub section", await ev(`document.querySelector("#sync-title")?.textContent === "Sync with GitHub"`));
  check("the repository and token fields have labels", await ev(`["sync-repo", "sync-token"].every((id) => !!document.querySelector("label[for=" + id + "]"))`));
  check("the token field hides what you type", await ev(`document.querySelector("#sync-token").type === "password" && document.querySelector("#sync-token").autocomplete === "off"`));
  check("Create a repository opens GitHub in a new tab", await ev(`(() => { const a = [...document.querySelectorAll("#sync-section a")].find((x) => x.textContent.startsWith("Create a repository")); return a?.href === "https://github.com/new" && a.target === "_blank"; })()`));
  check("sync links to its help page", await ev(`!!document.querySelector("#sync-section a[href='#help/sync']")`));

  await ev(click("#sync-connect"));
  check("Connect without a repository says what to enter", await until(`/account\\/name/.test(document.querySelector("#sync-section .msg-error")?.textContent ?? "")`, 2000));
  check("focus moves to the repository field", await ev(`document.activeElement?.id === "sync-repo"`), await ev(FOCUS));

  await ev(setValue("#sync-repo", "https://github.com/me/cards"));
  check("the token link asks for Contents write for the account", await ev(`(() => { const a = [...document.querySelectorAll("#sync-section a")].find((x) => x.textContent.startsWith("Create a token")); if (!a) return false; const u = new URL(a.href); return a.target === "_blank" && u.searchParams.get("contents") === "write" && u.searchParams.get("target_name") === "me"; })()`));

  await ev(setValue("#sync-token", "wrong-token"));
  await ev(click("#sync-connect"));
  check("a refused token is reported", await until(`/refused the token/.test(document.querySelector("#sync-section .msg-error")?.textContent ?? "")`, 5000));
  check("a refused token doesn't connect", await ev(`!document.querySelector("#sync-now")`));
  check("the app sends no User-Agent of its own to GitHub", gh.requests.every((r) => !("User-Agent" in r.headers) || !/Cascade|card-?discovery/i.test(r.headers["User-Agent"])));

  await ev(setValue("#sync-token", GH_TOKEN));
  await ev(click("#sync-connect"));
  check("Connect syncs and shows the time", await until(`/Last sync:/.test(document.querySelector("#sync-section")?.textContent ?? "")`, 8000));
  check("focus moves to Sync now after connecting", await until(`document.activeElement?.id === "sync-now"`, 1000), await ev(FOCUS));
  check("the section names the repository with a link", await ev(`!!document.querySelector("#sync-section a[href='https://github.com/me/cards']")`));
  check("the token isn't shown anywhere on the page", !(await ev(`document.body.innerHTML.includes(${JSON.stringify(GH_TOKEN)})`)));
  const appLists = await ev(`(async () => {
    const db = await new Promise((r, j) => { const q = indexedDB.open("card-discovery"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    const all = await new Promise((r) => { const q = db.transaction("lists").objectStore("lists").getAll(); q.onsuccess = () => r(q.result); });
    db.close();
    return all.map((l) => l.name).sort();
  })()`);
  check("the first sync puts every list on GitHub", JSON.stringify(gh.remote()?.lists.map((l) => l.name).sort()) === JSON.stringify(appLists), JSON.stringify(gh.remote()?.lists.map((l) => l.name)));

  // Another device adds a list.
  const remote = gh.remote();
  const at = new Date().toISOString();
  remote.lists.push({ id: "from-other-device", name: "From another device", kind: "collection", format: "standard", entries: [], createdAt: at, updatedAt: at });
  gh.put(JSON.stringify(remote));
  await ev(`document.querySelector("#sync-now").focus()`);
  await ev(click("#sync-now"));
  await until(`/Last sync:/.test(document.querySelector("#sync-section")?.textContent ?? "") && document.querySelector("#sync-now").getAttribute("aria-disabled") !== "true"`, 8000);
  check("focus stays on Sync now during and after a sync", await ev(`document.activeElement?.id === "sync-now"`), await ev(FOCUS));
  await ev(`location.hash = "#lists"`);
  check("Sync now brings in a list from another device", await until(`document.querySelector("#view-lists").textContent.includes("From another device")`, 5000));

  // A synced setting changes, and the app syncs on its own a few seconds later.
  await ev(click("#density-toggle"));
  let synced = false;
  for (let i = 0; i < 60 && !synced; i++) {
    synced = gh.remote()?.settings.density === "nerd";
    if (!synced) await sleep(250);
  }
  check("a change syncs on its own", synced);
  await ev(click("#density-toggle"));

  await ev(`location.hash = "#data"`);
  await until(`!document.querySelector("#view-data").hidden`, 3000);

  // Backups on GitHub.
  check("Export to GitHub shows while connected", await ev(`document.querySelector("#backup-github")?.textContent === "Export to GitHub"`));
  await ev(`document.querySelector("#backup-github").focus()`);
  await ev(click("#backup-github"));
  let exported = false;
  for (let i = 0; i < 40 && !exported; i++) {
    exported = [...gh.files.keys()].some((k) => /^backups\/card-discovery-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(k));
    if (!exported) await sleep(250);
  }
  check("Export to GitHub writes a backup file to the backups folder", exported, JSON.stringify([...gh.files.keys()]));
  const ghBackup = exported ? JSON.parse([...gh.files.values()][0].text) : null;
  check("the backup on GitHub is a full backup with history", !!ghBackup && Array.isArray(ghBackup.history) && Array.isArray(ghBackup.lists));
  check("the backup on GitHub never holds the token", exported && ![...gh.files.values()].some((f) => f.text.includes(GH_TOKEN)));
  check("Export to GitHub says where the backup went", await until(`/backups\\/card-discovery-backup-/.test(document.body.textContent)`, 3000));
  check("Export to GitHub dates the last backup", await until(`!/Last backup: (never|Never)/.test(document.querySelector("#view-data").textContent)`, 3000));
  check("focus stays on Export to GitHub", await ev(`document.activeElement?.id === "backup-github"`), await ev(FOCUS));

  // Another device's backup, with a list this device doesn't have.
  const other = JSON.parse(JSON.stringify(ghBackup));
  const at2 = new Date().toISOString();
  other.lists.push({ id: "from-github-backup", name: "From a GitHub backup", kind: "collection", format: "standard", entries: [], createdAt: at2, updatedAt: at2 });
  other.exportedAt = "2099-01-01T00:00:00.000Z";
  gh.files.set("backups/card-discovery-backup-2099-01-01-000000.json", { text: JSON.stringify(other), sha: `sha-${++gh.shas}` });
  check("Choose a backup on GitHub shows while connected", await ev(`!!document.querySelector("#import-github-list")`));
  await ev(click("#import-github-list"));
  check("the backups on GitHub show newest first, in a labeled list", await until(`(() => { const s = document.querySelector("#import-github-file"); return !!s && !!document.querySelector("label[for=import-github-file]") && s.options[0]?.value.includes("2099-01-01") && !/\\.json$/.test(s.options[0].textContent) && /20[0-9][0-9]/.test(s.options[0].textContent); })()`, 5000));
  check("focus moves to the list of backups on GitHub", await until(`document.activeElement?.id === "import-github-file"`, 1000), await ev(FOCUS));
  await ev(click("#import-github-open"));
  check("a backup from GitHub shows the import choices", await until(`/This backup is from/.test(document.querySelector("#view-data").textContent) && !!document.querySelector("#mode-merge")`, 5000));
  await ev(clickText("#view-data button", "Import"));
  await ev(clickText("#view-data .confirm button", "Merge"));
  check("a backup from GitHub merges in", await until(`/Merged the backup/.test(document.querySelector("#view-data").textContent)`, 5000));
  await ev(`location.hash = "#lists"`);
  check("the list from the GitHub backup shows in Lists", await until(`document.querySelector("#view-lists").textContent.includes("From a GitHub backup")`, 5000));
  await ev(`location.hash = "#data"`);
  await until(`!document.querySelector("#view-data").hidden`, 3000);
  // A backup deleted on GitHub after the list was read.
  await ev(click("#import-github-list"));
  await until(`!!document.querySelector("#import-github-file")`, 5000);
  gh.files.delete("backups/card-discovery-backup-2099-01-01-000000.json");
  await ev(click("#import-github-open"));
  check("a backup that's gone from GitHub says to choose again", await until(`/isn't on GitHub anymore/.test(document.querySelector("#view-data").textContent)`, 5000));
  check("focus moves to Choose a backup on GitHub after a read error", await until(`document.activeElement?.id === "import-github-list"`, 1000), await ev(FOCUS));
  await ev(click("#import-github-list"));
  await until(`!!document.querySelector("#import-github-file")`, 5000);

  check("the Backup and Import sections have no horizontal scroll", await ev(`[...document.querySelectorAll("#view-data .panel-box")].every((s) => s.scrollWidth <= s.clientWidth + 1)`));

  check("the Sync section has no horizontal scroll", await ev(`(() => { const s = document.querySelector("#sync-section"); return s.scrollWidth <= s.clientWidth + 1; })()`));
  await ev(click("#sync-disconnect"));
  await ev(clickText("#sync-section .confirm button", "Disconnect"));
  check("Disconnect shows Connect again", await until(`!!document.querySelector("#sync-connect")`, 3000));
  check("the GitHub backup buttons and list go away after Disconnect", await ev(`!document.querySelector("#backup-github") && !document.querySelector("#import-github-list") && !document.querySelector("#import-github-file") && !document.querySelector("#import-github-open")`));
  check("focus moves to the repository field after Disconnect", await until(`document.activeElement?.id === "sync-repo"`, 1000), await ev(FOCUS));
  check("Disconnect deletes the token from the browser", !(await ev(`(async () => {
    const db = await new Promise((r, j) => { const q = indexedDB.open("card-discovery"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    const v = await new Promise((r) => { const q = db.transaction("meta").objectStore("meta").get("sync"); q.onsuccess = () => r(q.result); });
    db.close();
    return JSON.stringify(v ?? null).includes(${JSON.stringify(GH_TOKEN)});
  })()`)));
}

/**
 * A browser that saved lists with an older version of the app keeps them:
 * the IndexedDB upgrade from version 1 adds the deletions store and changes
 * no data. Runs once, in its own browser profile.
 */
async function upgrade(base, check) {
  const chrome = await launchChrome();
  const b = await connect(chrome.port);
  try {
    await b.send("Page.navigate", { url: `${base}/icons/icon.svg` });
    await b.until(`document.readyState === "complete"`, 5000);
    const at = "2026-11-01T00:00:00.000Z";
    await b.ev(`new Promise((resolve, reject) => {
      const q = indexedDB.open("card-discovery", 1);
      q.onupgradeneeded = () => {
        const db = q.result;
        db.createObjectStore("lists", { keyPath: "id" });
        db.createObjectStore("presets", { keyPath: "id" });
        db.createObjectStore("history", { keyPath: "id" }).createIndex("drawnAt", "drawnAt");
        db.createObjectStore("meta", { keyPath: "key" });
      };
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction("lists", "readwrite");
        tx.objectStore("lists").put({ id: "saved-before", name: "Saved before sync", kind: "collection", format: "standard", entries: [], createdAt: ${JSON.stringify(at)}, updatedAt: ${JSON.stringify(at)} });
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => reject(tx.error);
      };
      q.onerror = () => reject(q.error);
    })`);
    await b.send("Page.navigate", { url: `${base}/#lists` });
    check("upgrade: a list saved by the older version still shows", await b.until(`document.querySelector("#view-lists")?.textContent.includes("Saved before sync")`, 10000));
    check("upgrade: the database is version 2 with a deletions store", await b.ev(`new Promise((r) => { const q = indexedDB.open("card-discovery"); q.onsuccess = () => { const db = q.result; const ok = db.version === 2 && db.objectStoreNames.contains("deletions"); db.close(); r(ok); }; })`));
    check("upgrade: no console errors", b.errors.length === 0, b.errors.join(" | "));
  } catch (e) {
    check("upgrade: run without errors", false, e.message);
  } finally {
    b.close();
    await chrome.close();
  }
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
    const gh = await fakeGitHub(b);
    await b.send("Page.navigate", { url: `${base}/#discover` });
    check("app starts", await b.until(`!!document.querySelector("#view-discover h1")`));
    await shell(b, width, check);
    const name = await discover(b, check);
    await discoverTips(b, check);
    await details(b, width, name, check);
    await exploreFlow(b, check);
    await browse(b, check);
    await lists(b, check);
    await data(b, check);
    await sync(b, gh, check);
    await dialogTip(b, check);
    await learnMore(b, check);
    await help(b, check);
    check("no horizontal page scroll", !(await b.ev("document.documentElement.scrollWidth > window.innerWidth")));
    check("no console errors", b.errors.length === 0, b.errors.join(" | "));
  } catch (e) {
    check("run without errors", false, e.message);
  } finally {
    b.close();
    await chrome.close();
  }
}

console.log("\n## IndexedDB upgrade");
await upgrade(base, (name, ok, detail = "") => {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
});

server.close();
console.log(`\n${total - failed} of ${total} checks passed.`);
process.exit(failed ? 1 : 0);
