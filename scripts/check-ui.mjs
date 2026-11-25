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
    // A control in a closed group still has a box in Chrome, but no one can reach it.
    const shown = (el) => { const d = el.closest("details"); return !d || d.open || el.parentElement.closest("summary"); };
    const els = [...document.querySelectorAll(${JSON.stringify(scope)} + " [aria-describedby]")].filter((el) => el.getClientRects().length > 0 && shown(el)
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
  // Open the filter groups, so their ? buttons are checked too.
  await ev(`document.querySelectorAll("#filters-panel details.filter-group").forEach((d) => { d.open = true; })`);
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
  await ev(`[...document.querySelectorAll("#view-discover .preset-row button")].find((x) => x.textContent.trim() === "Save as preset").id = "save-preset-test"`);
  await hover(b, "#save-preset-test");
  await b.until(tipOpen("#save-preset-test"), 1000);
  await ev(click("#save-preset-test"));
  check("clicking a button closes its tooltip", !(await ev(tipOpen("#save-preset-test"))));
  await ev(clickText("#view-discover .preset-slot button", "Cancel"));
  await mouseAway(b);
  check("Discover has tooltips on its buttons and filters", n >= 12, String(n));
  await ev(`document.querySelectorAll("#filters-panel details.filter-group").forEach((d) => { d.open = false; })`);
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
  check("the Arena Brawl preset uses Brawl and color identity", /f:brawl/.test(await ev(QUERY))
    && await ev(`[...document.querySelectorAll(".chips .chip")].some((c) => /^Brawl/.test(c.textContent))`));
  // The newest Standard set comes from Scryfall's set list, so it shows up
  // after the first count. The list is large and waits in the queue, so
  // this check waits longer than most.
  const NEWEST = `document.querySelector('#view-discover .preset-row option[value="builtin-newest-standard"]')`;
  check("the Newest Standard set preset is listed, named in plain words", await until(`!!${NEWEST}`, 45000)
    && /^Newest Standard set: \S.* \(built in\)$/.test(await ev(`${NEWEST}.textContent`)),
  // On a failure, say which of its requests the page sent.
  await ev(`${NEWEST}?.textContent ?? (performance.getEntriesByType("resource").filter((r) => /api\\.scryfall\\.com\\/(sets|cards\\/random\\?q=e)/.test(r.name)).map((r) => r.name.replace(/^.*\\.com/, "") + " " + r.responseStatus + " " + Math.round(r.duration) + " ms").join(", ") || "no set requests")`));
  const setName = (await ev(`${NEWEST}?.textContent`) ?? "").replace(/^Newest Standard set: /, "").replace(/ \(built in\)$/, "");
  await ev(setValue("#view-discover .preset-row select", "builtin-newest-standard", "change"));
  check("the Newest Standard set preset can't be renamed or deleted", await ev(`document.querySelector("#view-discover .preset-row select").value === "builtin-newest-standard"`) && await ev(`[...document.querySelectorAll("#view-discover .preset-row button")].filter((x) => /^(Rename|Delete)$/.test(x.textContent)).every((x) => x.hidden)`));
  check("the Newest Standard set preset searches the set in Standard on Arena, with plain chips",
    /^f:standard game:arena -is:rebalanced e:[a-z0-9]+$/.test(await ev(QUERY))
    && await ev(`(() => {
      const chips = [...document.querySelectorAll(".chips .chip > span")].map((c) => c.textContent);
      return chips.includes(${JSON.stringify(`Set: ${setName}`)}) && chips.some((c) => /Standard/.test(c)) && !chips.some((c) => /\\b(e|f|game|is):/.test(c));
    })()`), `${await ev(QUERY)} | ${await ev(CHIPS)}`);
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
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
  // A drawn card made only for Arena has no Buy link, so this can't require one. Browse does.
  check("a tile's Buy link, when it has one, opens the card on TCGplayer in a new tab", await ev(`[...document.querySelectorAll(".results .tile a.buy")].every((a) =>
    (a.href.startsWith("https://partner.tcgplayer.com/") || a.href.startsWith("https://www.tcgplayer.com/search/magic/product?"))
    && a.target === "_blank" && a.rel.includes("noopener")
    && / on TCGplayer$/.test(a.querySelector(".visually-hidden")?.textContent ?? "") && !!a.closest(".tile-actions"))`));
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
 * The filters added after v1, in groups that open and close: Card,
 * Creature, Printing, and Popularity. Each one reaches the search and
 * shows as a chip in plain words.
 */
async function moreFilters(b, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  const open = await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded") === "true"`);
  if (!open) await ev(click("#filters-toggle"));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  const groups = `[...document.querySelectorAll("#filters-panel details.filter-group")]`;
  check("the filters have Card, Creature, Printing, and Popularity groups, closed at first",
    await ev(`${groups}.map((d) => d.dataset.group).join("|") === "card|creature|printing|popularity" && ${groups}.every((d) => !d.open)`),
    await ev(`${groups}.map((d) => d.dataset.group + ":" + d.open).join(", ")`));
  check("each group is opened by a button you can reach by keyboard, as tall as --tap", await ev(`${groups}.every((d) => {
    const s = d.querySelector(":scope > summary");
    s.focus();
    const tap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tap"));
    const ok = document.activeElement === s && s.getBoundingClientRect().height >= tap;
    s.blur();
    return ok;
  })`), await ev(`${groups}.map((d) => d.querySelector(":scope > summary").getBoundingClientRect().height).join(", ")`));
  const group = (g) => `document.querySelector("#filters-panel details[data-group=${g}]")`;
  const openGroup = async (g) => { if (!(await ev(`${group(g)}.open`))) await ev(`${group(g)}.querySelector("summary").click()`); };

  await openGroup("popularity");
  await ev(setValue("#f-popularity", "spicy", "change"));
  check("Popularity: Spicy reaches the search", await until(`${QUERY}.includes("edhrec>10000")`, 3000), await ev(QUERY));
  check("Popularity: the chip says Spicy in plain words", await ev(`${CHIPS}.includes("Spicy: rarely played in Commander")`), await ev(CHIPS));
  check("a group's button says how many of its filters are on", /1 on/.test(await ev(`${group("popularity")}.querySelector("summary").textContent`)));

  await openGroup("creature");
  for (const k of ["flying", "trample"]) await ev(`document.querySelector("#filters-panel input[name=creatureKeywords][value='${k}']").click()`);
  check("Creature abilities: ticked keywords must all match", await until(`${QUERY}.includes("kw:flying kw:trample")`, 3000), await ev(QUERY));
  check("Creature abilities: the chip names them", await ev(`${CHIPS}.includes("Flying and trample")`), await ev(CHIPS));
  await ev(setValue("#f-pow-min", "3"));
  check("Power reaches the search", await until(`${QUERY}.includes("pow>=3")`, 3000));

  await openGroup("card");
  await ev(setValue("#f-ability-count", "3plus", "change"));
  check("Number of abilities reaches the search", await until(`${QUERY}.includes("o:/\\\\n[^\\\\n]*\\\\n/")`, 3000), await ev(QUERY));
  await ev(`document.querySelector("#filters-panel input[name=roles][value=ramp]").click()`);
  check("What the card does reaches the search", await until(`${QUERY}.includes("otag:ramp")`, 3000));
  await ev(`document.querySelector("#f-commander").click()`);
  check("Can be your commander reaches the search", await until(`${QUERY}.includes("is:commander")`, 3000));

  await openGroup("printing");
  await ev(setValue("#f-year-min", "2024"));
  check("Age: first printed from a year, checked on the whole card", await until(`${QUERY}.includes("in:arena") && ${QUERY}.includes("year>=2024 not:reprint")`, 3000), await ev(QUERY));
  check("Age: the chip says First printed", await ev(`${CHIPS}.includes("First printed 2024 or later")`), await ev(CHIPS));
  await ev(setValue("#f-price-max", "2"));
  check("Price: on Arena it shows why it isn't used", await until(`/paper/i.test(document.querySelector("#f-price-max-hint")?.textContent ?? "") && !${QUERY}.includes("usd")`, 3000));
  check("Price: on Arena its chip says it isn't used", await ev(`${CHIPS}.includes("$2 or less: not used on Arena")`), await ev(CHIPS));
  await ev(setValue("#f-price-max", ""));
  await ev(setValue("#f-year-max", "1850"));
  check("Age: a year before 1993 says why it isn't used", await until(`/1993/.test(document.querySelector("#f-year-max").closest(".group-body").textContent)`, 3000));
  await ev(setValue("#f-year-max", ""));
  check("Set: the list of sets loads", await until(`!!document.querySelector("#f-set-search") && !document.querySelector("#f-set-search").disabled`, 15000));
  await ev(setValue("#f-set-search", "duskmourn"));
  check("Set: typing a name finds the set", await until(`[...document.querySelectorAll("#f-set-results label")].some((l) => /Duskmourn: House of Horror/.test(l.textContent))`, 3000),
    await ev(`document.querySelector("#f-set-results")?.textContent ?? "no list"`));
  // Tick it from the keyboard: focus stays on the box.
  await ev(`[...document.querySelectorAll("#f-set-results label")].find((l) => /^Duskmourn: House of Horror/.test(l.textContent)).querySelector("input").focus()`);
  for (const type of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type, key: " ", code: "Space", windowsVirtualKeyCode: 32, text: type === "keyDown" ? " " : undefined });
  check("Set: a ticked set reaches the search", await until(`${QUERY}.includes("e:dsk")`, 3000), await ev(QUERY));
  check("Set: focus stays on the set you ticked", await ev(`document.activeElement?.value === "dsk" && document.activeElement.checked`), await ev(FOCUS));
  check("Set: the chip names the set", await ev(`${CHIPS}.includes("Set: Duskmourn: House of Horror")`), await ev(CHIPS));
  check("Set: the ticked set stays in the list when the search changes", await (async () => {
    await ev(setValue("#f-set-search", "bloomburrow"));
    return ev(`[...document.querySelectorAll("#f-set-results input:checked")].some((i) => i.value === "dsk")`);
  })());
  // A phone widens its layout to fit a wide element, and then innerWidth
  // grows too, so this measures every element against the screen instead.
  check("the filters still fit the screen", await ev(`[...document.querySelectorAll("#filters-panel *")].every((e) => e.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)`),
    await ev(`[...document.querySelectorAll("#filters-panel *")].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 3).map((e) => e.tagName + "." + e.className).join(", ")`));

  // Removing a chip clears its control.
  await ev(`[...document.querySelectorAll(".chips .chip button")].find((x) => /Spicy/.test(x.getAttribute("aria-label"))).click()`);
  check("removing the Spicy chip resets Popularity", await until(`document.querySelector("#f-popularity").value === "" && !${QUERY}.includes("edhrec")`, 3000));
  await ev(`[...document.querySelectorAll(".chips .chip button")].find((x) => /Set: Duskmourn/.test(x.getAttribute("aria-label"))).click()`);
  check("removing the Set chip unticks the set", await until(`!document.querySelector("#f-set-results input[value=dsk]")?.checked && !${QUERY}.includes("e:dsk")`, 3000));

  // The last search comes back after a reload, with its groups open.
  // The last search is saved to IndexedDB after each change. Wait for the
  // save, or the reload can bring back the search from before a chip was
  // removed. Page.navigate to the same address with a hash only scrolls, so
  // this reloads instead.
  await sleep(1000);
  await b.send("Page.reload", {});
  await sleep(500);
  await until(`!!document.querySelector("#filters-toggle")`);
  await ev(click("#filters-toggle"));
  check("after a reload, groups with filters on are open", await until(`["card", "creature", "printing"].every((g) => document.querySelector("#filters-panel details[data-group=" + g + "]")?.open)`, 5000),
    await ev(`${groups}.map((d) => d.dataset.group + ":" + d.open).join(", ")`));
  check("after a reload, a group with no filters on stays closed", await ev(`!${group("popularity")}.open`));

  // A plain preset clears them.
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  check("applying a preset clears the new filters", await until(`${QUERY} === "f:standard game:arena -is:rebalanced"`, 3000), await ev(QUERY));
  check("groups with no filters on say so", await ev(`${groups}.every((d) => !/\\d on/.test(d.querySelector("summary").textContent))`));
}

/**
 * Colors for Commander-type formats. Lands have no color, so green lands
 * for Commander need color identity. Picking such a format ticks Use color
 * identity, and ticking a color with the mode on Any picks a mode that fits.
 */
async function commanderColors(b, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  if (await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded") !== "true"`)) await ev(click("#filters-toggle"));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  const box = (label) => `[...document.querySelectorAll("#filters-panel label.check")].find((l) => l.textContent.trim() === ${JSON.stringify(label)}).querySelector("input")`;

  await ev(`window.__heard = []; new MutationObserver(() => { const t = document.querySelector("#live").textContent; if (t) window.__heard.push(t); }).observe(document.querySelector("#live"), { childList: true, characterData: true, subtree: true })`);
  await ev(setValue("#f-format", "commander", "change"));
  check("picking Commander ticks Use color identity", await until(`document.querySelector("#f-identity").checked`, 3000));
  await ev(`${box("Green")}.click()`);
  await ev(`${box("Land")}.click()`);
  check("green lands for Commander: identity, at most green", await until(`${QUERY} === "f:commander game:arena -is:rebalanced id<=g t:land"`, 3000), await ev(QUERY));
  check("the color mode shows At most", await ev(`document.querySelector("#f-color-mode").value === "atMost"`));
  check("the color chip names color identity", await ev(`${CHIPS}.includes("Color identity at most green")`), await ev(CHIPS));
  check("no hint asks for a color mode", await ev(`!/Choose a color mode/.test(document.querySelector("#filters-panel").textContent)`));
  check("the changes the form makes on its own are announced", await until(`/Use color identity/.test(window.__heard.join(" | ")) && /Color mode: At most/.test(window.__heard.join(" | "))`, 3000), await ev(`window.__heard.join(" | ")`));

  // Removing another chip keeps a mode the app chose.
  await ev(`[...document.querySelectorAll(".chips .chip button")].find((x) => x.getAttribute("aria-label") === "Remove filter: Land").click()`);
  await ev(`${box("Green")}.click()`);
  check("unticking the last color returns the mode to Any", await until(`document.querySelector("#f-color-mode").value === "any"`, 3000), await ev(`document.querySelector("#f-color-mode").value`));
  check("no hint asks for a color", await ev(`!/Choose at least one color/.test(document.querySelector("#filters-panel").textContent)`));
  await ev(`${box("Green")}.click()`);

  // Unticking identity changes a mode the app chose, but not one chosen by hand.
  await ev(`document.querySelector("#f-identity").click()`);
  check("without identity, the chosen mode becomes At least", await until(`${QUERY}.includes("c>=g")`, 3000), await ev(QUERY));
  await ev(setValue("#f-color-mode", "exactly", "change"));
  await ev(`document.querySelector("#f-identity").click()`);
  check("a mode chosen by hand stays", await until(`${QUERY}.includes("id=g")`, 3000), await ev(QUERY));

  // Other formats read colors as card color.
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
  await ev(`${box("Red")}.click()`);
  check("Standard: ticking Red finds red cards", await until(`${QUERY} === "f:standard game:arena -is:rebalanced c>=r"`, 3000), await ev(QUERY));
  check("every checkbox label points at its own box", await ev(`[...document.querySelectorAll("label.check[for]")].every((l) => document.getElementById(l.htmlFor) === l.querySelector("input"))`),
    await ev(`[...document.querySelectorAll("label.check[for]")].filter((l) => document.getElementById(l.htmlFor) !== l.querySelector("input")).map((l) => l.textContent).join(", ")`));
  check("Standard doesn't tick Use color identity", await ev(`!document.querySelector("#f-identity").checked`));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
}

/**
 * Built-in presets. Choosing one applies it at once, and the list always
 * names the preset that matches the filters, or says Custom filters.
 */
async function presets(b, check) {
  const { ev, until } = b;
  const SELECT = "#view-discover .preset-row select";
  const selected = `(() => { const s = document.querySelector(${JSON.stringify(SELECT)}); return s.value + "|" + s.selectedOptions[0]?.textContent; })()`;
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  check("there is no Apply button for presets", await ev(`![...document.querySelectorAll("#view-discover .preset-row button")].some((x) => x.textContent.trim() === "Apply")`));
  check("the Preset field has a ? button", await ev(`!!document.querySelector("#view-discover .preset-row .info-tip, #view-discover .preset-row button[aria-label^='About']")`));
  const expected = {
    "builtin-arena-standard": "f:standard game:arena -is:rebalanced",
    "builtin-arena-standard-lands": "f:standard game:arena -is:rebalanced t:land (-t:basic)",
    "builtin-arena-brawl": "f:brawl game:arena -is:rebalanced",
    "builtin-arena-brawl-lands": "f:brawl game:arena -is:rebalanced t:land (-t:basic)",
    "builtin-commander": "f:commander",
    "builtin-commander-budget": "f:commander usd<=2",
    "builtin-commander-staples": "f:commander edhrec<1000",
    "builtin-commanders": "f:commander is:commander",
    "builtin-commander-lands": "f:commander t:land (-t:basic)",
    "builtin-commander-colorless": "f:commander id=c (-t:land)",
  };
  const POOL = `document.querySelector(".pool").textContent`;
  let lastPool = "";
  for (const [id, q] of Object.entries(expected)) {
    const name = await ev(`document.querySelector('${SELECT} option[value="${id}"]')?.textContent ?? ""`);
    await ev(setValue(SELECT, id, "change"));
    check(`choosing the preset ${name || id} applies it at once`, await until(`${QUERY} === ${JSON.stringify(q)}`, 3000), await ev(QUERY));
    // Each preset finds a different number of cards, so a new count means this preset's count.
    check(`the preset ${name || id} finds cards`, await until(`/^[1-9][\\d,]* cards? match/.test(${POOL}) && ${POOL} !== ${JSON.stringify(lastPool)}`, 20000), await ev(POOL));
    lastPool = await ev(POOL);
    check(`the preset ${name || id} stays chosen`, (await ev(selected)).startsWith(`${id}|`), await ev(selected));
  }
  check("the preset chips use plain words", await ev(`![...document.querySelectorAll(".chips .chip > span")].some((c) => /\\b[a-z]+[:<>=]/.test(c.textContent))`), await ev(CHIPS));
  check("choosing a preset is announced", await until(`/Applied the preset/.test(document.querySelector("#live").textContent)`, 3000));

  // A changed filter no longer matches a preset.
  await ev(setValue(SELECT, "builtin-commander", "change"));
  await until(`${QUERY} === "f:commander"`, 3000);
  await ev(`[...document.querySelectorAll(".chips .chip button")].find((x) => x.getAttribute("aria-label") === "Remove filter: Commander").click()`);
  check("after a filter changes, the list says Custom filters", await until(`${selected}.endsWith("|Custom filters")`, 3000), await ev(selected));
  check("Rename and Delete are hidden for Custom filters", await ev(`[...document.querySelectorAll("#view-discover .preset-row button")].filter((x) => /^(Rename|Delete)$/.test(x.textContent)).every((x) => x.hidden)`));
  // Choosing the same preset again brings its filters back.
  await ev(setValue(SELECT, "builtin-commander", "change"));
  check("choosing the preset again restores its filters", await until(`${QUERY} === "f:commander"`, 3000), await ev(QUERY));
  check("Custom filters leaves the list once a preset matches", await ev(`![...document.querySelectorAll("${SELECT} option")].some((o) => o.textContent === "Custom filters")`));

  // The Newest Standard set preset arrives late, and is named once it does.
  if (await ev(`!!document.querySelector('${SELECT} option[value="builtin-newest-standard"]')`)) {
    await ev(setValue(SELECT, "builtin-newest-standard", "change"));
    check("choosing the Newest Standard set preset applies it and stays chosen", await until(`/ e:[a-z0-9]+$/.test(${QUERY})`, 3000) && (await ev(selected)).startsWith("builtin-newest-standard|"), await ev(selected));
  }

  // A saved preset is chosen, can be renamed and deleted, and keeps its own
  // name even when a built-in preset has the same filters.
  await ev(setValue(SELECT, "builtin-commander", "change"));
  await until(`${QUERY} === "f:commander"`, 3000);
  await ev(clickText("#view-discover .preset-row button", "Save as preset"));
  await ev(`document.querySelector("#view-discover .preset-slot input").value = "Twin of Commander"`);
  await ev(`document.querySelector("#view-discover .preset-slot button[type=submit]").click()`);
  check("a saved twin of a built-in preset is chosen with its own name", await until(`${selected}.endsWith("|Twin of Commander")`, 3000), await ev(selected));
  check("a saved preset can be renamed and deleted", await ev(`[...document.querySelectorAll("#view-discover .preset-row button")].filter((x) => /^(Rename|Delete)$/.test(x.textContent)).every((x) => !x.hidden)`));
  await ev(clickText("#view-discover .preset-row button", "Delete"));
  await ev(clickText("#view-discover .preset-slot button", "Delete preset"));
  check("after a delete, the list names the built-in preset with the same filters", await until(`${selected}.startsWith("builtin-commander|")`, 3000), await ev(selected));
  check("the deleted preset is gone from the list", await ev(`![...document.querySelectorAll("${SELECT} option")].some((o) => o.textContent === "Twin of Commander")`));

  // After a reload, the list names the preset that matches the saved filters.
  await ev(setValue(SELECT, "builtin-commander-budget", "change"));
  await until(`${QUERY} === "f:commander usd<=2"`, 3000);
  await sleep(1000);
  await b.send("Page.reload", {});
  await sleep(500);
  await until(`!!document.querySelector(${JSON.stringify(SELECT)})`);
  check("after a reload, the list names the matching preset", await until(`${selected}.startsWith("builtin-commander-budget|")`, 5000), await ev(selected));
  await ev(setValue(SELECT, "builtin-arena-standard", "change"));
  await until(`${QUERY} === "f:standard game:arena -is:rebalanced"`, 3000);
}

/**
 * Clear all filters: one button removes every filter and the Scryfall
 * search. Undo shows in its place and puts them back, with the color mode
 * the app picked.
 */
async function clearFilters(b, check) {
  const { ev, until } = b;
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  if (await ev(`document.querySelector("#filters-toggle").getAttribute("aria-expanded") !== "true"`)) await ev(click("#filters-toggle"));
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-brawl", "change"));
  const box = (label) => `[...document.querySelectorAll("#filters-panel label.check")].find((l) => l.textContent.trim() === ${JSON.stringify(label)}).querySelector("input")`;
  await ev(`${box("Blue")}.click()`);
  await ev(setValue("#filters-panel textarea", "t:wizard"));
  await ev(setValue("#f-pow-min", "2"));
  const before = await ev(QUERY);
  check("clear all: the search has filters to clear", /f:brawl/.test(before ?? "") && /id<=u/.test(before ?? "") && /t:wizard/.test(before ?? "") && /pow>=2/.test(before ?? ""), before);

  check("Clear all filters shows when filters are on", await ev(`!!document.querySelector("#clear-filters") && !document.querySelector("#clear-filters").hidden`));
  check("Clear all filters sits with the filter chips", await ev(`!!document.querySelector("#clear-filters")?.closest(".chips-row")`));
  check("Clear all filters has a tooltip", await ev(`!!document.getElementById(document.querySelector("#clear-filters")?.getAttribute("aria-describedby") ?? "")?.textContent`));
  await ev(click("#clear-filters"));
  check("clear all removes every chip", await until(`${CHIPS} === "No filters: any card"`, 3000), await ev(CHIPS));
  check("clear all empties the search", await ev(`!${QUERY}`), await ev(QUERY));
  check("clear all resets the form", await ev(`document.querySelector("#f-format").value === "" && !document.querySelector("#f-identity").checked
    && document.querySelector("#filters-panel textarea").value === "" && document.querySelector("#f-pow-min").value === ""
    && document.querySelector("#f-color-mode").value === "any" && ![...document.querySelectorAll("#filters-panel input[type=checkbox]")].some((i) => i.checked)`));
  check("the filter groups no longer say any are on", await ev(`[...document.querySelectorAll("#filters-panel details.filter-group summary")].every((s) => !/\\d on/.test(s.textContent))`));
  check("Clear all filters hides when no filters are on", await ev(`document.querySelector("#clear-filters").hidden`));
  check("Undo clear all shows in its place", await ev(`!!document.querySelector("#undo-clear")?.closest(".chips-row") && !document.querySelector("#undo-clear").hidden`));
  check("focus moves to Undo clear all", await ev(`document.activeElement === document.querySelector("#undo-clear")`), await ev(FOCUS));
  check("nothing scrolls sideways after clear all", !(await ev("document.documentElement.scrollWidth > window.innerWidth")));

  await ev(click("#undo-clear"));
  check("Undo puts every filter back", await until(`${QUERY} === ${JSON.stringify(before)}`, 3000), await ev(QUERY));
  check("Undo hides itself and shows Clear all filters", await ev(`document.querySelector("#undo-clear").hidden && !document.querySelector("#clear-filters").hidden`));
  check("Undo puts focus on Clear all filters", await ev(`document.activeElement === document.querySelector("#clear-filters")`), await ev(FOCUS));
  // The app picked At most for Blue, so it still follows Use color identity.
  await ev(`document.querySelector("#f-identity").click()`);
  check("after Undo, the color mode the app picked still follows identity", await until(`${QUERY}.includes("c>=u")`, 3000), await ev(QUERY));

  // Any other change to the filters drops Undo.
  await ev(click("#clear-filters"));
  await ev(`${box("Red")}.click()`);
  check("a new filter hides Undo clear all", await until(`document.querySelector("#undo-clear").hidden`, 3000));

  // A setting with no chip can still be cleared.
  await ev(click("#clear-filters"));
  await ev(`document.querySelector("#f-identity").click()`);
  check("Clear all filters shows for Use color identity alone", await until(`!document.querySelector("#clear-filters").hidden`, 3000), await ev(CHIPS));
  await ev(click("#clear-filters"));

  // Browse with no filters doesn't send an empty search.
  await ev(click("#mode-browse"));
  await ev(clickText("#view-discover button", "Show cards"));
  check("Browse with no filters asks for one", await until(`/Add a filter/.test(document.querySelector(".browse-status").textContent)`, 3000), await ev(`document.querySelector(".browse-status").textContent`));
  await ev(click("#mode-draw"));

  // Leave the default search for the checks after this one.
  await ev(setValue("#view-discover .preset-row select", "builtin-arena-standard", "change"));
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
  const PRICED_BUY = `[...document.querySelectorAll(".results .tile a.buy")].find((a) => a.querySelector(".nerd-only"))`;
  // What a screen reader reads (every text that isn't display: none), and what shows on screen.
  const spoken = (a) => `[...${a}.childNodes].filter((n) => n.nodeType === 3 || getComputedStyle(n).display !== "none").map((n) => n.textContent).join("").replace(/\\s+/g, " ").trim()`;
  const shown = (a) => `[...${a}.childNodes].filter((n) => n.nodeType === 3 || (getComputedStyle(n).display !== "none" && !n.classList.contains("visually-hidden"))).map((n) => n.textContent).join("").trim()`;
  check("Browse tiles have Buy links named with the card and the store", await ev(`/^Buy .+ on TCGplayer$/.test(${spoken(PRICED_BUY)})`), await ev(spoken(PRICED_BUY)));
  check("a Buy link shows Buy, with no price, no price for screen readers, and no tooltip, outside nerd mode", await ev(`(() => {
    const a = ${PRICED_BUY};
    return ${shown("a")} === "Buy" && !/\\$/.test(${spoken("a")}) && !a.hasAttribute("aria-label") && !a.hasAttribute("aria-describedby");
  })()`));
  await ev(click("#density-toggle"));
  check("nerd mode shows the price in the Buy link, and screen readers hear it", await ev(`/^Buy\\s*\\$\\d+\\.\\d\\d$/.test(${shown(PRICED_BUY)}) && /^Buy .+ on TCGplayer \\$\\d+\\.\\d\\d$/.test(${spoken(PRICED_BUY)})`),
    `${await ev(shown(PRICED_BUY))} | ${await ev(spoken(PRICED_BUY))}`);
  check("the Buy link fits in its tile in nerd mode", await ev(`(() => { const a = ${PRICED_BUY}; const t = a.closest(".tile").getBoundingClientRect(); const r = a.getBoundingClientRect(); return r.right <= t.right + 0.5 && a.scrollWidth <= a.clientWidth + 1; })()`));
  await ev(click("#density-toggle"));
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

  // Buy cards.
  await ev(clickText("#view-lists button", "Buy cards"));
  await sleep(300);
  const BUY = `document.querySelector("#view-lists section[aria-labelledby=buy-title]")`;
  check("Buy cards opens a panel", await ev(`!!${BUY}`));
  check("Buy cards shows the list as text", /^1 \S/.test(await ev(`document.querySelector("textarea[aria-label='Cards to buy']")?.value ?? ""`)));
  check("Buy cards links to TCGplayer Mass Entry and Card Kingdom in new tabs", await ev(`(() => {
    const links = [...${BUY}.querySelectorAll("a.button")];
    const tcg = links.find((a) => a.href.startsWith("https://www.tcgplayer.com/massentry?c="));
    const ck = links.find((a) => a.href.startsWith("https://www.cardkingdom.com/builder?c="));
    return !!tcg && !!ck && [tcg, ck].every((a) => a.target === "_blank" && a.rel.includes("noopener"));
  })()`));
  check("Buy cards shows the count and an estimated total, or says there's no total", /^1 card to buy\. (Estimated total: \$\d[\d,]*\.\d\d, from Scryfall's TCGplayer prices as of |These cards have no saved price, so there's no estimated total\.)/
    .test(await ev(`${BUY}.querySelector(".buy-body > p")?.textContent ?? ""`)), await ev(`${BUY}.querySelector(".buy-body > p")?.textContent`));
  check("Buy cards ticks Main deck and Sideboard, not Maybe or Basic lands", await ev(`(() => {
    const box = (label) => [...${BUY}.querySelectorAll("label")].find((l) => l.textContent.trim() === label)?.querySelector("input");
    return box("Main deck")?.checked === true && box("Sideboard")?.checked === true && box("Maybe")?.checked === false && box("Basic lands")?.checked === false;
  })()`));
  check("Buy cards has Copy", await ev(`[...${BUY}.querySelectorAll("button")].some((x) => x.textContent.trim() === "Copy")`));
  check("Buy cards links to its help page", await ev(`!!${BUY}.querySelector("a[href='#help/lists-and-decks']")`));
  check("focus moves to the TCGplayer link in the Buy cards panel", await ev(`document.activeElement?.textContent.trim().startsWith("Open on TCGplayer") && !!document.activeElement.closest("section[aria-labelledby=buy-title]")`), await ev(FOCUS));
  // A tap focuses the checkbox, then changes it. The panel must keep that focus.
  await ev(`(() => { const box = [...${BUY}.querySelectorAll("label")].find((l) => l.textContent.trim() === "Main deck").querySelector("input"); box.focus(); box.click(); })()`);
  await sleep(200);
  check("unticking Main deck empties the list to buy and hides the store links", await ev(`document.querySelector("textarea[aria-label='Cards to buy']") === null && ${BUY}.querySelectorAll("a.button").length === 0 && /No cards to buy/.test(${BUY}.textContent)`));
  check("unticking Main deck announces the change", await until(`document.getElementById("live")?.textContent === "No cards to buy."`, 2000), await ev(`document.getElementById("live")?.textContent`));
  check("focus stays on the Main deck checkbox", await ev(`document.activeElement?.closest("label")?.textContent.trim() === "Main deck"`), await ev(FOCUS));
  check("the Buy cards panel has no horizontal scroll", await ev(`${BUY}.scrollWidth <= ${BUY}.clientWidth + 1`));
  await ev(clickText("#view-lists section[aria-labelledby=buy-title] button", "Close"));
  await sleep(200);
  check("closing Buy cards returns focus to it", await ev(`document.activeElement?.textContent.trim() === "Buy cards"`), await ev(FOCUS));
  await ev(clickText("#view-lists button", "More"));
  await ev(clickText("#list-more button", "Refresh card data"));
  await until(`!/Refreshing/.test(document.querySelector("#view-lists").textContent)`, 15000);
  await sleep(300);
  check("after More, then Refresh, focus goes back to More", await ev(`document.activeElement?.id === "list-more-btn"`), await ev(FOCUS));
  check("a collection has no Sample hand button", await ev(`![...document.querySelectorAll("#view-lists .list-actions button")].some((x) => x.textContent.trim() === "Sample hand")`));
  await ev(setValue("#kind-select", "deck", "change"));
  await sleep(500);
  check("deck stats show for a deck", await ev(`!!document.querySelector(".deck-stats .curve")`));
  await sampleHand(b, check);
  await ev(setValue("#format-select", "brawl", "change"));
  await sleep(500);
  await ev(clickText("#view-lists .list-actions button", "Sample hand"));
  await sleep(300);
  await ev(clickText("#view-lists section[aria-labelledby=hand-title] button", "Mulligan"));
  await sleep(200);
  check("in Brawl, the first mulligan is free", await ev(`(() => {
    const p = document.querySelector("#view-lists section[aria-labelledby=hand-title]");
    return p.querySelectorAll(".hand > li").length === 7 && !/Put on bottom/.test(p.textContent) && /free/i.test(p.querySelector(".hand-status")?.textContent ?? "");
  })()`), await ev(`document.querySelector(".hand-status")?.textContent`));
  await ev(clickText("#view-lists section[aria-labelledby=hand-title] button", "Close"));
  await sleep(200);
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
  // Duplicate: the copy opens, and a change to the copy leaves the first list the same.
  const firstHash = await ev(`location.hash`);
  await ev(clickText("#view-lists button", "More"));
  // Two quick presses must make one copy.
  await ev(`(() => { const d = [...document.querySelectorAll("#list-more button")].find((x) => x.textContent.trim() === "Duplicate"); d.click(); d.click(); })()`);
  check("Duplicate opens the copy", await until(`location.hash !== ${JSON.stringify(firstHash)} && document.querySelector("#lists-title")?.textContent === "UI check (copy)"`, 3000),
    await ev(`location.hash + " " + document.querySelector("#lists-title")?.textContent`));
  check("Duplicate announces the copy", await until(`document.getElementById("live")?.textContent === "Made a copy of UI check, named UI check (copy)."`, 2000), await ev(`document.getElementById("live")?.textContent`));
  check("focus moves to the copy's heading", await ev(`document.activeElement?.id === "lists-title"`), await ev(FOCUS));
  check("the copy has the same cards, kind, and format", await ev(`document.querySelectorAll(".entry").length === ${before} && document.querySelector("#view-lists .tagline .badge")?.textContent === "Brawl deck"`),
    await ev(`document.querySelectorAll(".entry").length + " " + document.querySelector("#view-lists .tagline .badge")?.textContent`));
  await ev(`document.querySelector(".entry button[aria-label^='Remove']").click()`);
  check("a card removed from the copy leaves the copy", await until(`document.querySelectorAll(".entry").length === ${before - 1}`, 3000));
  await ev(`location.hash = "#lists"`);
  check("two quick presses of Duplicate make one copy", await until(`document.querySelectorAll(".list-index a").length > 0`, 3000)
    && await ev(`[...document.querySelectorAll(".list-index .row-title")].filter((x) => x.textContent === "UI check (copy)").length === 1`),
    await ev(`[...document.querySelectorAll(".list-index .row-title")].map((x) => x.textContent).join(", ")`));
  await ev(`location.hash = ${JSON.stringify(firstHash)}`);
  check("the first list keeps all its cards", await until(`document.querySelector("#lists-title")?.textContent === "UI check" && document.querySelectorAll(".entry").length === ${before}`, 3000),
    await ev(`document.querySelector("#lists-title")?.textContent + " " + document.querySelectorAll(".entry").length`));
  await ev(`document.querySelector(".entry button[aria-label^='Remove']").click()`);
  await until(`!!document.querySelector("#view-lists .removed")`, 2000);
  await ev(`[...document.querySelectorAll("#view-lists .removed button")].find((x) => x.textContent.trim() === "Dismiss").click()`);
  await sleep(300);
  check("Dismiss moves focus to the list heading", await ev(`document.activeElement?.id === "lists-title"`), await ev(FOCUS));
  check("no toast or bar floats over the page", await ev(`[...document.querySelectorAll("body *")].every((n) => !["fixed", "sticky"].includes(getComputedStyle(n).position) || n.closest("dialog") || n.id === "inspector" || n.classList.contains("skip"))`),
    await ev(`[...document.querySelectorAll("body *")].filter((n) => ["fixed", "sticky"].includes(getComputedStyle(n).position)).map((n) => n.tagName + "." + n.className).join(", ")`));
}

/**
 * Sample hand on a deck: draw, mulligan, put on bottom, odds, focus, card
 * images left whole, and no sideways scroll. The deck is the one card in the
 * UI check list, raised to 20 copies so that a hand and draws fit.
 */
async function sampleHand(b, check) {
  const { ev, until } = b;
  await ev(setValue("#view-lists .entry input.qty", "20", "change"));
  await sleep(500);
  const PANEL = `document.querySelector("#view-lists section[aria-labelledby=hand-title]")`;
  const CARDS = `${PANEL}.querySelectorAll(".hand > li").length`;
  const btn = (text) => `[...${PANEL}.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(text)})`;
  check("a deck has a Sample hand button", await ev(`[...document.querySelectorAll("#view-lists .list-actions button")].some((x) => x.textContent.trim() === "Sample hand")`));
  await ev(clickText("#view-lists .list-actions button", "Sample hand"));
  await sleep(300);
  check("Sample hand opens a panel with 7 cards", await ev(`!!${PANEL} && ${CARDS} === 7`), await ev(`${PANEL} && ${CARDS}`));
  check("focus moves to Draw a card", await ev(`document.activeElement?.textContent.trim() === "Draw a card"`), await ev(FOCUS));
  check("the panel shows the three odds as percentages", await ev(`(() => {
    const items = [...${PANEL}.querySelectorAll(".hand-odds li")].map((li) => li.textContent);
    return items.length === 3 && items.every((t) => /\\d+%/.test(t));
  })()`), await ev(`[...${PANEL}.querySelectorAll(".hand-odds li")].map((li) => li.textContent).join(" | ")`));
  check("the panel links to its help page", await ev(`!!${PANEL}.querySelector("a[href='#help/lists-and-decks']")`));
  check("card images in the hand are whole: nothing covers them, and no transform, filter, clip, or cover", await ev(`(() => {
    const imgs = [...${PANEL}.querySelectorAll(".hand img")];
    if (!imgs.length) return ${PANEL}.querySelectorAll(".hand .is-text").length === 7;
    return imgs.every((img) => {
      img.scrollIntoView({ block: "center" });
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
      return points.every(([x, y]) => document.elementFromPoint(x, y) === img)
        && cs.transform === "none" && cs.filter === "none" && cs.clipPath === "none" && cs.objectFit !== "cover";
    });
  })()`));

  await ev(`${btn("Draw a card")}.click()`);
  await sleep(200);
  check("Draw a card adds the top card to the hand", await ev(`${CARDS} === 8`), await ev(`${CARDS}`));
  check("Draw a card announces the card", await until(`/^Drew /.test(document.getElementById("live")?.textContent ?? "")`, 2000), await ev(`document.getElementById("live")?.textContent`));
  check("focus stays on Draw a card", await ev(`document.activeElement?.textContent.trim() === "Draw a card"`), await ev(FOCUS));
  check("no mulligan after a draw", await ev(`${btn("Mulligan")}.disabled === true`));

  await ev(`${btn("New hand")}.click()`);
  await sleep(200);
  check("New hand deals 7 cards again", await ev(`${CARDS} === 7 && ${btn("Mulligan")}.disabled === false`));
  await ev(`${btn("Mulligan")}.click()`);
  await sleep(200);
  check("Mulligan deals 7 new cards, each with Put on bottom", await ev(`${CARDS} === 7 && [...${PANEL}.querySelectorAll(".hand > li")].every((li) => [...li.querySelectorAll("button")].some((x) => x.textContent.trim() === "Put on bottom"))`));
  check("Put on bottom is below the card image, not over it", await ev(`[...${PANEL}.querySelectorAll(".hand > li")].every((li) => {
    const m = li.querySelector(".card-media").getBoundingClientRect();
    const x = [...li.querySelectorAll("button")].find((x) => x.textContent.trim() === "Put on bottom").getBoundingClientRect();
    return x.top >= m.bottom - 0.5;
  })`));
  check("each Put on bottom name starts with its visible text", await ev(`[...${PANEL}.querySelectorAll(".hand .to-bottom")].every((x) => x.getAttribute("aria-label").startsWith("Put on bottom: "))`));
  check("Draw a card waits until the card is on the bottom", await ev(`${btn("Draw a card")}.disabled === true`));
  check("Mulligan announces the card to put on the bottom", await until(`/Put 1 card on the bottom/.test(document.getElementById("live")?.textContent ?? "")`, 2000), await ev(`document.getElementById("live")?.textContent`));
  check("focus stays on Mulligan", await ev(`document.activeElement?.textContent.trim() === "Mulligan"`), await ev(FOCUS));
  check("the Sample hand panel has no horizontal scroll", await ev(`${PANEL}.scrollWidth <= ${PANEL}.clientWidth + 1`));
  check("no horizontal page scroll with a hand shown", !(await ev("document.documentElement.scrollWidth > window.innerWidth")));
  await ev(`[...${PANEL}.querySelectorAll(".hand button")].find((x) => x.textContent.trim() === "Put on bottom").click()`);
  await sleep(200);
  check("Put on bottom leaves 6 cards and no more Put on bottom buttons", await ev(`${CARDS} === 6 && !/Put on bottom/.test(${PANEL}.querySelector(".hand").textContent)`));
  check("after the last card goes to the bottom, focus moves to Draw a card", await ev(`document.activeElement?.textContent.trim() === "Draw a card" && !document.activeElement.disabled`), await ev(FOCUS));
  // 20 cards: a new hand of 7, then 13 draws, empties the library.
  await ev(`${btn("New hand")}.click()`);
  for (let i = 0; i < 13; i++) await ev(`${btn("Draw a card")}.click()`);
  await sleep(200);
  check("when the library runs out, Draw a card turns off and focus moves to New hand", await ev(`${btn("Draw a card")}.disabled === true && document.activeElement === ${btn("New hand")}`), await ev(FOCUS));
  await ev(`${btn("Close")}.click()`);
  await sleep(200);
  check("closing Sample hand returns focus to it", await ev(`document.activeElement?.textContent.trim() === "Sample hand"`), await ev(FOCUS));
}

/** Lists: Import deck. Paste text, review the lines that didn't match, fix or skip them, and save. */
async function importDeck(b, check) {
  const { ev, until } = b;
  const PANEL = `document.querySelector("#view-lists section[aria-labelledby=import-title]")`;
  const IN_PANEL = (sel) => `${PANEL}?.querySelector(${JSON.stringify(sel)})`;
  const clickIn = (text) => `[...${PANEL}.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(text)}).click()`;
  await ev(`location.hash = "#lists"`);
  await until(`!document.querySelector("#view-lists").hidden && !!document.querySelector("#import-deck-btn")`, 3000);
  check("Lists has an Import deck button", await ev(`document.querySelector("#import-deck-btn")?.textContent.trim() === "Import deck"`));
  check("a closed Import deck panel isn't named by aria-controls", await ev(`!document.querySelector("#import-deck-btn").hasAttribute("aria-controls")`));
  await tooltipsIn(b, "#view-lists", "Lists index", check);
  await ev(click("#import-deck-btn"));
  await sleep(300);
  check("Import deck opens a panel", await ev(`!!${PANEL}`));
  check("focus moves to the deck text box", await ev(`document.activeElement?.id === "import-text"`), await ev(FOCUS));
  check("the deck text box has a label", await ev(`document.querySelector("label[for=import-text]")?.textContent.trim() === "Deck text"`));
  check("Import deck links to its help page", await ev(`!!${IN_PANEL("a[href='#help/lists-and-decks']")}`));
  const PRIMARIES = `[...document.querySelectorAll("#view-lists button.primary")].filter((x) => x.getClientRects().length > 0).length`;
  check("Lists has one primary button with the Import deck panel open", (await ev(PRIMARIES)) === 1, String(await ev(PRIMARIES)));
  const text = "About\nName UI import\n\nDeck\n4 Llanowar Elves (FDN) 227\n2 Not A Real Card Name\n1 Karn, Scion of Urza (DAR) 1\n\nSideboard\n2 Opt";
  await ev(setValue("#import-text", text));
  await ev(clickIn("Look up cards"));
  check("the deck text can't change while the lookup runs", await ev(`document.querySelector("#import-text").readOnly === true`));
  check("Look up cards shows what it found", await until(`/Found 3 of 4 card lines\./.test(${PANEL}.textContent)`, 20000), await ev(`${PANEL}.textContent`));
  check("the name comes from the deck text", await ev(`document.querySelector("#import-name").value === "UI import"`));
  check("a line that didn't match shows in a box to fix", await ev(`(() => { const i = ${PANEL}.querySelector(".import-problems input"); return i?.value === "2 Not A Real Card Name" && i.getAttribute("aria-label") === "Line 6"; })()`));
  check("a line that didn't match has Skip", await ev(`!!${PANEL}.querySelector(".import-problems button[aria-label='Skip line 6']")`));
  check("the lookup announces what it found", await until(`/Found 3 of 4 card lines/.test(document.getElementById("live")?.textContent ?? "")`, 2000), await ev(`document.getElementById("live")?.textContent`));
  await ev(clickIn("Save list"));
  await sleep(200);
  check("Save list waits until each line is fixed or skipped", await ev(`/Fix or skip/.test(${PANEL}.textContent) && !!${PANEL}`));
  check("focus moves to the line to fix", await ev(`document.activeElement?.getAttribute("aria-label") === "Line 6"`), await ev(FOCUS));
  await ev(setValue(".import-problems input", "2 Serra Angel"));
  await ev(clickIn("Look up again"));
  check("Look up again finds the fixed line", await until(`/Found 4 of 4 card lines\./.test(${PANEL}.textContent) && !${PANEL}.querySelector(".import-problems")`, 20000), await ev(`${PANEL}.textContent`));
  check("the Import deck panel has no horizontal scroll", await ev(`${PANEL}.scrollWidth <= ${PANEL}.clientWidth + 1`));
  check("Lists still has one primary button after the lookup", (await ev(PRIMARIES)) === 1, String(await ev(PRIMARIES)));
  // A quick double press saves once.
  await ev(`(() => { const x = [...${PANEL}.querySelectorAll("button")].find((y) => y.textContent.trim() === "Save list"); x.click(); x.click(); })()`);
  check("Save list opens the new list", await until(`document.querySelector("#lists-title")?.textContent === "UI import"`, 5000), await ev(`document.querySelector("#lists-title")?.textContent`));
  check("the imported list is a deck with the cards in their sections", await ev(`(() => {
    const t = document.querySelector("#view-lists").textContent;
    return /Standard deck/.test(t) && document.querySelector("#sec-main")?.textContent === "Main deck (7)" && document.querySelector("#sec-sideboard")?.textContent === "Sideboard (2)";
  })()`), await ev(`[...document.querySelectorAll("#view-lists h2")].map((x) => x.textContent).join(" | ")`));

  // Into an existing list, skipping a line that didn't match.
  await ev(`location.hash = "#lists"`);
  await until(`!!document.querySelector("#import-deck-btn")`, 3000);
  check("a double press of Save list made one list", await ev(`[...document.querySelectorAll(".list-index .row-title")].filter((x) => x.textContent === "UI import").length === 1`));
  await ev(click("#import-deck-btn"));
  await sleep(300);
  await ev(`(() => { const s = document.querySelector("#import-target"); s.value = [...s.options].find((o) => o.textContent === "UI import").value; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  check("choosing an existing list hides the name box", await ev(`document.querySelector("#import-name").closest(".field")?.hidden === true`));
  check("choosing an existing list shows its format", await ev(`document.querySelector("#import-format").value === "standard"`));
  await ev(setValue("#import-text", "3 Opt\n1 Zzzz Not A Card Name"));
  await ev(clickIn("Look up cards"));
  await until(`!!${PANEL}?.querySelector(".import-problems")`, 20000);
  await ev(setValue("#import-text", "3 Opt\n1 Zzzz Not A Card Name\n"));
  check("changing the deck text clears the results", await ev(`!${PANEL}.querySelector(".import-problems") && ${PANEL}.querySelector(".import-results").textContent === ""`));
  await ev(setValue("#import-format", "brawl", "change"));
  await ev(clickIn("Look up cards"));
  await until(`!!${PANEL}?.querySelector(".import-problems")`, 20000);
  await ev(`${PANEL}.querySelector(".import-problems button[aria-label^='Skip line']").click()`);
  await sleep(200);
  check("Skip takes the line out", await ev(`!${PANEL}.querySelector(".import-problems") && /Skipped 1 line\./.test(${PANEL}.textContent)`), await ev(`${PANEL}.textContent`));
  await ev(clickIn("Save list"));
  check("importing into a list adds to its cards", await until(`document.querySelector("#lists-title")?.textContent === "UI import" && document.querySelector("#sec-main")?.textContent === "Main deck (10)"`, 5000),
    await ev(`document.querySelector("#sec-main")?.textContent`));
  check("the chosen format applies to the list", /Brawl deck/.test(await ev(`document.querySelector("#view-lists .tagline")?.textContent ?? ""`)));

  // A new panel starts over: a new list, in Standard. Cancel returns focus to Import deck.
  await ev(`location.hash = "#lists"`);
  await until(`!!document.querySelector("#import-deck-btn")`, 3000);
  await ev(click("#import-deck-btn"));
  await sleep(300);
  check("a reopened Import deck panel starts with a new list in Standard", await ev(`document.querySelector("#import-target").value === "" && document.querySelector("#import-format").value === "standard" && document.querySelector("#import-text").value === ""`));
  await ev(clickIn("Cancel"));
  await sleep(200);
  check("Cancel closes the panel and returns focus to Import deck", await ev(`!${PANEL} && document.activeElement?.id === "import-deck-btn"`), await ev(FOCUS));
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

/** Presses Enter on the focused element, as a keyboard does. */
async function pressEnter(b) {
  for (const type of ["keyDown", "keyUp"]) {
    await b.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: type === "keyDown" ? "\r" : undefined });
  }
}

/** The quantities of one card in a stored list, by section. */
const storedCopies = (listId, cardKey) => `(async () => {
  const db = await new Promise((r, j) => { const q = indexedDB.open("card-discovery"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
  const list = await new Promise((r) => { const q = db.transaction("lists").objectStore("lists").get(${JSON.stringify(listId)}); q.onsuccess = () => r(q.result); });
  db.close();
  const out = {};
  for (const e of list?.entries ?? []) if ((e.card.oracleId ?? e.card.name) === ${cardKey}) out[e.section] = (out[e.section] ?? 0) + e.quantity;
  return JSON.stringify(out);
})()`;

/**
 * Deck mode (issue #39): choose a deck, add and remove copies from the
 * card captions, Undo, the deck bar, hiding cards in the deck, the same
 * controls in card details, keyboard focus, and no sideways scroll.
 */
async function deckMode(b, width, check) {
  const { ev, until } = b;
  const at = new Date().toISOString();
  // An empty Standard deck, saved straight to the database, then a reload.
  await ev(`new Promise((resolve, reject) => {
    const q = indexedDB.open("card-discovery");
    q.onsuccess = () => {
      const db = q.result;
      const tx = db.transaction("lists", "readwrite");
      tx.objectStore("lists").put({ id: "deck-mode-check", name: "Deck mode check", kind: "deck", format: "standard", entries: [], createdAt: ${JSON.stringify(at)}, updatedAt: ${JSON.stringify(at)} });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    };
    q.onerror = () => reject(q.error);
  })`);
  await ev(`location.hash = "#lists/deck-mode-check"`);
  await b.send("Page.reload", {});
  await sleep(500);
  await until(`document.querySelector("#view-lists h1")?.textContent === "Deck mode check"`, 10000);

  // Lists → Discover.
  check("deck mode: a deck in Lists has Edit in Discover", await ev(`document.querySelector("#edit-in-discover")?.textContent.trim() === "Edit in Discover"`));
  if (!(await ev(`!!document.querySelector("#edit-in-discover")`))) return;
  await ev(click("#edit-in-discover"));
  const BAR = `document.querySelector("#deck-bar")`;
  const barText = `(${BAR}?.textContent ?? "")`;
  check("deck mode: Edit in Discover opens Discover with the deck bar", await until(`!document.querySelector("#view-discover").hidden && !!${BAR} && !${BAR}.hidden`, 3000));
  check("deck mode: the bar names the deck and gives its count", await ev(`/Deck mode check/.test(${barText}) && /0 of 60/.test(${barText})`), await ev(barText));
  check("deck mode: the bar says how many problems the checks find", await ev(`/No problems|problem/.test(${barText})`), await ev(barText));
  check("deck mode: the bar has Open deck and Stop", await ev(`(() => {
    const open = [...${BAR}.querySelectorAll("a")].find((a) => a.textContent.trim() === "Open deck");
    return open?.getAttribute("href") === "#lists/deck-mode-check" && document.querySelector("#deck-stop")?.textContent.trim() === "Stop";
  })()`));
  check("deck mode: the Deck menu shows the chosen deck", (await ev(`document.querySelector("#deck-select")?.value`)) === "deck-mode-check");
  check("deck mode: the Deck menu has a label", await ev(`!!document.querySelector("label[for=deck-select]")`));
  check("deck mode: the Deck menu lists decks and no collections", await ev(`(() => {
    const names = [...document.querySelectorAll("#deck-select option")].map((o) => o.textContent);
    return names.some((n) => n.startsWith("Deck mode check")) && !names.some((n) => n.startsWith("From another device"));
  })()`), await ev(`[...document.querySelectorAll("#deck-select option")].map((o) => o.textContent).join(" | ")`));
  check("deck mode: the filters start from the deck's format", await ev(`/Standard/.test(${CHIPS})`) && /f:standard/.test(await ev(QUERY)), await ev(CHIPS));
  check("deck mode: Adds to lists the Standard sections", (await ev(`[...document.querySelectorAll("#deck-section option")].map((o) => o.value).join(",")`)) === "main,sideboard,maybe");

  // Cards with counts.
  await ev(setValue("#view-discover textarea", "t:goblin t:creature"));
  await ev(click("#mode-browse"));
  await ev(setValue("#browse-sort", "name", "change"));
  await ev(setValue("#browse-dir", "asc", "change"));
  await ev(clickText("#view-discover button", "Show cards"));
  check("deck mode: Browse shows cards", await until(`document.querySelectorAll(".results .tile").length >= 3`, 30000));
  const cardKey = await ev(`document.querySelector(".results .tile")?.dataset.cardKey`);
  const T = `document.querySelector(".results .tile[data-card-key=" + JSON.stringify(${JSON.stringify(cardKey)}) + "]")`;
  const deckText = `(${T}?.querySelector(".tile-deck")?.textContent ?? "")`;
  const PLUS = `${T}?.querySelector(".tile-deck .deck-plus")`;
  const MINUS = `${T}?.querySelector(".tile-deck .deck-minus")`;
  check("deck mode: each card shows its count in the deck", await ev(`/0 in Main deck/.test(${deckText})`), await ev(deckText));
  check("deck mode: the count and + and − are in the caption, not on the image", await ev(`(() => {
    const t = ${T};
    const s = t?.querySelector(".tile-deck");
    return !!s && t.querySelector(".tile-info").contains(s) && !t.querySelector(".tile-frame").contains(s);
  })()`));
  check("deck mode: + and − are labeled for the card and the section", await ev(`/^Add a copy of .+ to Main deck$/.test(${PLUS}?.getAttribute("aria-label") ?? "") && /^Remove a copy of .+ from Main deck$/.test(${MINUS}?.getAttribute("aria-label") ?? "")`));
  check("deck mode: the Add button stays", await ev(`!!${T}.querySelector(".tile-actions button[aria-label^='Add ']")`));
  check("deck mode: nothing sits on top of the card image", await ev(`(() => {
    const img = ${T}.querySelector("img");
    if (!img) return true;
    img.scrollIntoView({ block: "center" });
    const r = img.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    window.scrollTo(0, 0);
    return hit === img;
  })()`));

  // + by keyboard, up to the copy limit.
  await ev(`${PLUS}.focus()`);
  await pressEnter(b);
  check("deck mode: + adds a copy", await until(`/1 in Main deck/.test(${deckText})`, 3000), await ev(deckText));
  check("deck mode: focus stays on + after adding", await ev(`document.activeElement === ${PLUS}`), await ev(FOCUS));
  check("deck mode: the bar count goes up", await until(`/1 of 60/.test(${barText})`, 2000), await ev(barText));
  check("deck mode: the copy is saved in the deck", await until(`${storedCopies("deck-mode-check", JSON.stringify(cardKey))}.then((s) => s === '{"main":1}')`, 3000), await ev(storedCopies("deck-mode-check", JSON.stringify(cardKey))));
  for (let n = 2; n <= 4; n++) {
    await pressEnter(b);
    await until(`new RegExp("${n} in Main deck").test(${deckText})`, 3000);
  }
  check("deck mode: + stops at 4 copies in Standard", await ev(`/4 in Main deck/.test(${deckText}) && ${PLUS}.getAttribute("aria-disabled") === "true"`), await ev(deckText));
  check("deck mode: the caption says the deck has the most copies it can have", await ev(`/most/i.test(${deckText})`), await ev(deckText));
  check("deck mode: + at the limit stays in the keyboard order", await ev(`document.activeElement === ${PLUS} && !${PLUS}.disabled`), await ev(FOCUS));
  await pressEnter(b);
  await sleep(600);
  check("deck mode: + at the limit adds nothing", await ev(`/4 in Main deck/.test(${deckText}) && /4 of 60/.test(${barText})`), await ev(deckText));
  check("deck mode: + at the limit says why", await ev(`/at most 4/.test(document.querySelector("#live").textContent)`), await ev(`document.querySelector("#live").textContent`));

  // − down to 0, then Undo.
  await ev(`${MINUS}.focus()`);
  for (let n = 3; n >= 1; n--) {
    await pressEnter(b);
    await until(`new RegExp("${n} in Main deck").test(${deckText})`, 3000);
  }
  check("deck mode: − takes a copy away", await ev(`/1 in Main deck/.test(${deckText})`), await ev(deckText));
  check("deck mode: focus stays on − after removing", await ev(`document.activeElement === ${MINUS}`), await ev(FOCUS));
  await pressEnter(b);
  check("deck mode: − at 1 removes the card and shows Undo in the caption", await until(`!!${T}.querySelector(".tile-deck button.undo")`, 3000), await ev(deckText));
  check("deck mode: focus moves to Undo", await until(`document.activeElement === ${T}.querySelector(".tile-deck button.undo")`, 1000), await ev(FOCUS));
  check("deck mode: the bar count goes back to 0", await until(`/0 of 60/.test(${barText})`, 2000), await ev(barText));
  await pressEnter(b);
  check("deck mode: Undo puts the card back", await until(`/1 in Main deck/.test(${deckText})`, 3000), await ev(deckText));
  check("deck mode: after Undo, focus goes back to the card's controls", await until(`!!${T}.querySelector(".tile-deck")?.contains(document.activeElement) && document.activeElement.tagName === "BUTTON"`, 1000), await ev(FOCUS));
  check("deck mode: Undo saves the card in the deck again", await until(`${storedCopies("deck-mode-check", JSON.stringify(cardKey))}.then((s) => s === '{"main":1}')`, 3000));

  // Adds to.
  await ev(setValue("#deck-section", "sideboard", "change"));
  check("deck mode: Adds to changes the section the cards count", await until(`/0 in Sideboard/.test(${deckText}) && /Also 1 in Main deck/.test(${deckText})`, 2000), await ev(deckText));
  check("deck mode: + then adds to the sideboard", await ev(`/^Add a copy of .+ to Sideboard$/.test(${PLUS}.getAttribute("aria-label"))`));
  await ev(setValue("#deck-section", "main", "change"));
  await until(`/1 in Main deck/.test(${deckText})`, 2000);

  // Card details.
  await ev(`${T}.querySelector("button[aria-label^='Details for']").click()`);
  await sleep(300);
  check("deck mode: card details have the same count and controls", await until(`/1 in Main deck/.test(document.querySelector("dialog[open] .tile-deck")?.textContent ?? "")`, 2000));
  await ev(`document.querySelector("dialog[open] .tile-deck .deck-plus").click()`);
  check("deck mode: + in card details adds a copy, and the tile follows", await until(`/2 in Main deck/.test(document.querySelector("dialog[open] .tile-deck")?.textContent ?? "") && /2 in Main deck/.test(${deckText})`, 3000));
  await b.key("Escape", 27);
  await sleep(300);

  // Hide cards in the deck.
  check("deck mode: Hide cards in the deck is off at first", await ev(`document.querySelector("#deck-hide")?.checked === false && !!document.querySelector("label[for=deck-hide]")`));
  await ev(click("#deck-hide"));
  check("deck mode: Hide cards in the deck hides the card", await until(`${T}.hidden || getComputedStyle(${T}).display === "none"`, 2000));
  check("deck mode: a note says how many cards are hidden", await until(`/1 card in the deck is hidden/.test(document.querySelector("#deck-hidden-note")?.textContent ?? "")`, 2000), await ev(`document.querySelector("#deck-hidden-note")?.textContent`));
  await ev(click("#deck-hide"));
  check("deck mode: turning it off shows the card again", await until(`!${T}.hidden && getComputedStyle(${T}).display !== "none"`, 2000));

  // Layout.
  check("deck mode: no sideways scroll", !(await ev("document.documentElement.scrollWidth > window.innerWidth")));
  check("deck mode: the bar has no sideways scroll", await ev(`${BAR}.scrollWidth <= ${BAR}.clientWidth + 1`));
  // A fixed bar would cover card images as the page scrolls, so it never floats.
  check("deck mode: the bar is above the results and doesn't float", await ev(`${BAR}.getBoundingClientRect().bottom <= document.querySelector(".results").getBoundingClientRect().top + 1 && !["fixed", "sticky"].includes(getComputedStyle(${BAR}).position)`));

  // After a reload.
  await b.send("Page.reload", {});
  await sleep(500);
  check("deck mode: the chosen deck stays after a reload", await until(`!!${BAR} && !${BAR}.hidden && /Deck mode check/.test(${barText}) && /2 of 60/.test(${barText})`, 10000), await ev(barText));
  check("deck mode: the choice isn't in the settings", await ev(`(async () => {
    const db = await new Promise((r, j) => { const q = indexedDB.open("card-discovery"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    const v = await new Promise((r) => { const q = db.transaction("meta").objectStore("meta").get("settings"); q.onsuccess = () => r(q.result); });
    db.close();
    return !JSON.stringify(v ?? null).includes("deck-mode-check");
  })()`));

  // Stop, then choose the deck from the Deck menu.
  await ev(`document.querySelector("#deck-stop").focus()`);
  await pressEnter(b);
  check("deck mode: Stop ends deck mode", await until(`!${BAR} || ${BAR}.hidden`, 2000) && (await ev(`document.querySelector("#deck-select").value`)) === "");
  check("deck mode: after Stop, focus moves to the Deck menu", await ev(`document.activeElement?.id === "deck-select"`), await ev(FOCUS));
  check("deck mode: after Stop, cards have no deck controls", await ev(`!document.querySelector(".tile-deck") || [...document.querySelectorAll(".tile-deck")].every((s) => s.hidden)`));
  await ev(setValue("#deck-select", "deck-mode-check", "change"));
  check("deck mode: choosing a deck from the Deck menu starts deck mode", await until(`!!${BAR} && !${BAR}.hidden && /Deck mode check/.test(${barText})`, 2000));
  check("deck mode: a Standard deck's colors become the color filter", await until(`/At most (white|blue|black|red|green)/.test(${CHIPS})`, 2000), await ev(CHIPS));

  // Cards again, with hiding on. The card has 2 copies, so it hides.
  await ev(clickText("#view-discover button", "Show cards"));
  await until(`!!${T}`, 30000);
  if (width >= 1200) {
    await ev(`${PLUS}.focus()`);
    check("deck mode: the inspector has the same count and controls", await until(`/2 in Main deck/.test(document.querySelector("#inspector .tile-deck")?.textContent ?? "")`, 3000));
    await ev(`document.activeElement.blur()`);
  }
  await ev(click("#deck-hide"));
  await until(`${T}.hidden`, 2000);

  // The deck changes in Lists: a Brawl format, then a collection.
  await ev(`location.hash = "#lists/deck-mode-check"`);
  await until(`!!document.querySelector("#format-select")`, 3000);
  await ev(setValue("#format-select", "brawl", "change"));
  await sleep(500);
  await ev(`location.hash = "#discover"`);
  check("deck mode: a Brawl deck adds to the main deck, commander, or Maybe", await until(`[...document.querySelectorAll("#deck-section option")].map((o) => o.value).join(",") === "main,commander,maybe"`, 2000));
  check("deck mode: + stops at 1 copy in Brawl", await ev(`${PLUS}?.getAttribute("aria-disabled") === "true"`));
  await ev(`location.hash = "#lists/deck-mode-check"`);
  await until(`!!document.querySelector("#kind-select")`, 3000);
  await ev(setValue("#kind-select", "collection", "change"));
  await sleep(500);
  await ev(`location.hash = "#discover"`);
  await until(`!document.querySelector("#view-discover").hidden`, 3000);
  check("deck mode: it stops when its deck becomes a collection", await until(`!${BAR} || ${BAR}.hidden`, 2000));
  check("deck mode: when it stops on its own, hidden cards show again", await ev(`!!${T} && !${T}.hidden && document.querySelector("#deck-hidden-note").hidden`));
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
    await importDeck(b, check);
    await data(b, check);
    await sync(b, gh, check);
    await dialogTip(b, check);
    await learnMore(b, check);
    await help(b, check);
    // Reloads the page, so it runs after the checks that need drawn cards.
    await moreFilters(b, check);
    await commanderColors(b, check);
    await clearFilters(b, check);
    // Reloads the page too, and adds a deck of its own.
    await deckMode(b, width, check);
    await presets(b, check);
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
