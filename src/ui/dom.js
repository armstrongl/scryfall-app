// Small DOM helpers shared by the views.

const PROPS = new Set(["value", "checked", "disabled", "selected", "readOnly", "hidden", "indeterminate"]);

/**
 * Makes an element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] `class`, `text`, `on<event>` handlers,
 *   `dataset`, properties such as `value` and `checked`, and any attribute.
 * @param {...(Node|string|null|undefined|false|(Node|string)[])} children
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false && !PROPS.has(key)) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces all children of an element. */
export function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

let liveRegion = null;

/** Announces a message to screen readers through the aria-live region. */
export function announce(message) {
  liveRegion ??= document.getElementById("live");
  if (!liveRegion) return;
  liveRegion.textContent = "";
  // A short delay makes screen readers read the same message twice in a row.
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 50);
}

let idCounter = 0;
/** A unique ID for label and control pairs. */
export function uid(prefix = "f") {
  return `${prefix}-${++idCounter}`;
}

/**
 * A confirmation inside the page. Browser dialogs are not permitted.
 * Returns an element that shows the question with Confirm and Cancel.
 * @param {{message: string, confirmLabel: string, onConfirm: () => void|Promise<void>, onCancel: () => void}} opts
 */
export function confirmBox({ message, confirmLabel, onConfirm, onCancel }) {
  const yes = h("button", { type: "button", class: "danger", text: confirmLabel });
  const no = h("button", { type: "button", text: "Cancel", onclick: onCancel });
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    no.disabled = true;
    try {
      await onConfirm();
    } finally {
      yes.disabled = false;
      no.disabled = false;
    }
  });
  const box = h("div", { class: "confirm", role: "group", "aria-label": "Confirm" },
    h("p", { text: message }),
    h("div", { class: "row" }, yes, no));
  queueMicrotask(() => no.focus());
  return box;
}

/**
 * A labeled field: label above a control. With `tip`, a ? button beside the
 * label explains the field.
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [hint] Text under the control.
 * @param {string} [tip] Tooltip text, from TIPS in src/docs.js.
 */
export function field(label, control, hint, tip) {
  const id = control.id || uid();
  control.id = id;
  const hintEl = hint ? h("p", { class: "hint", id: `${id}-hint`, text: hint }) : null;
  if (hintEl) control.setAttribute("aria-describedby", hintEl.id);
  const labelEl = h("label", { for: id, text: label });
  return h("div", { class: "field" }, tip ? h("div", { class: "label-row" }, labelEl, infoTip(label, tip)) : labelEl, control, hintEl);
}

// Tooltips ------------------------------------------------------------------------
// A tooltip shows on hover and on keyboard focus, and a ? button also shows
// its tooltip on click or tap. Escape hides open tooltips, so they never block
// anything (WCAG 1.4.13); in a dialog, a second Escape closes the dialog. A
// tooltip goes below its control, or above it when below would leave the
// screen or cover a card image.

/** @type {Set<{wrap: HTMLElement, hide: () => void}>} */
const openTips = new Set();
let tipEventsReady = false;

function setUpTipEvents() {
  if (tipEventsReady) return;
  tipEventsReady = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // A tooltip removed from the page while open can't be seen, so it
    // doesn't take the Escape that a dialog needs.
    for (const t of [...openTips]) if (!t.wrap.isConnected) t.hide();
    if (openTips.size === 0) return;
    for (const t of [...openTips]) t.hide();
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener("pointerdown", (e) => {
    for (const t of [...openTips]) if (!(e.target instanceof Node && t.wrap.contains(e.target))) t.hide();
  }, true);
}

const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

/**
 * Puts an open tooltip where it fits, inside the screen or dialog. It never
 * covers a card image: when neither side is clear of cards, it stays hidden.
 * @returns {boolean} false when it can't be shown.
 */
function placeTip(wrap, tip) {
  const gap = 6;
  const edge = 8;
  tip.classList.remove("tip-above");
  tip.style.left = "0px";
  const a = wrap.getBoundingClientRect();
  const dialog = wrap.closest("dialog")?.getBoundingClientRect();
  const box = {
    left: Math.max(0, dialog?.left ?? 0) + edge,
    right: Math.min(document.documentElement.clientWidth, dialog?.right ?? Infinity) - edge,
    top: Math.max(0, dialog?.top ?? 0),
    bottom: Math.min(window.innerHeight, dialog?.bottom ?? Infinity),
  };
  const w = tip.offsetWidth;
  const ht = tip.offsetHeight;
  let left = 0;
  if (a.left + w > box.right) left = box.right - w - a.left;
  if (a.left + left < box.left) left = box.left - a.left;
  tip.style.left = `${Math.round(left)}px`;
  const x = { left: a.left + left, right: a.left + left + w };
  const below = { ...x, top: a.bottom + gap, bottom: a.bottom + gap + ht };
  const above = { ...x, top: a.top - gap - ht, bottom: a.top - gap };
  const cards = [...document.querySelectorAll(".card-media img, .card-media .card-text")]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
  const clear = (r) => !cards.some((c) => overlaps(r, c));
  const fits = (r) => r.top >= box.top && r.bottom <= box.bottom && clear(r);
  if (fits(below)) return true;
  if (fits(above) || (!clear(below) && clear(above))) {
    tip.classList.add("tip-above");
    return true;
  }
  return clear(below);
}

/**
 * Wires a tooltip to its control. The tooltip and control are inside `wrap`.
 * @param {HTMLElement} wrap
 * @param {HTMLElement} anchor The control.
 * @param {HTMLElement} tip The tooltip element, with role="tooltip".
 * @param {{toggle?: boolean}} [opts] toggle: a click shows or hides it.
 */
export function wireTip(wrap, anchor, tip, opts = {}) {
  setUpTipEvents();
  let pinned = false;
  let byFocus = false;
  const api = {
    wrap,
    show() {
      if (wrap.classList.contains("tip-open")) return;
      wrap.classList.add("tip-open");
      openTips.add(api);
      if (!placeTip(wrap, tip)) api.hide();
    },
    hide() {
      pinned = false;
      byFocus = false;
      wrap.classList.remove("tip-open");
      openTips.delete(api);
    },
  };
  // A tap on a touch screen isn't a hover, so it shows nothing.
  wrap.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") api.show(); });
  wrap.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && !pinned) api.hide(); });
  anchor.addEventListener("focus", () => {
    if (!anchor.matches(":focus-visible")) return;
    api.show();
    byFocus = true;
  });
  anchor.addEventListener("blur", () => api.hide());
  anchor.addEventListener("click", () => {
    // A button's tooltip closes when the button is used, so the cards it
    // brings never appear under the tooltip.
    if (!opts.toggle) return api.hide();
    // A ? button: a click hides a tooltip that's pinned or that keyboard
    // focus opened, and pins one that hover opened.
    if (pinned || byFocus) return api.hide();
    api.show();
    pinned = true;
  });
  return api;
}

/**
 * A control with a tooltip that says what it does.
 * @param {HTMLElement} anchor
 * @param {string} text From TIPS in src/docs.js.
 * @param {{toggle?: boolean}} [opts]
 */
export function withTip(anchor, text, opts = {}) {
  const tip = h("span", { class: "tooltip", role: "tooltip", id: uid("tip"), text });
  const wrap = h("span", { class: "tip-wrap" }, anchor, tip);
  anchor.setAttribute("aria-describedby", [anchor.getAttribute("aria-describedby"), tip.id].filter(Boolean).join(" "));
  wireTip(wrap, anchor, tip, opts);
  return wrap;
}

/**
 * A ? button that explains a field or setting.
 * @param {string} name What it explains, for the button's name: "About {name}".
 * @param {string} text From TIPS in src/docs.js.
 */
export function infoTip(name, text) {
  return withTip(h("button", { type: "button", class: "info-tip", "aria-label": `About ${name}`, text: "?" }), text, { toggle: true });
}

// Help links ------------------------------------------------------------------------

/**
 * A "Learn more" link to a help page. tests/docs.test.js checks that each
 * page ID exists.
 * @param {string} page A page ID in DOC_PAGES.
 * @param {string} text Starts with "Learn more about".
 */
export function helpLink(page, text) {
  return h("a", { href: `#help/${page}`, class: "help-link", text });
}

/** A help link in a dialog closes the dialog first, so the help page shows. */
export function closeOnHelpLink(dialog, close) {
  dialog.addEventListener("click", (e) => {
    // A modified click opens a new tab or window, so the dialog stays.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('a[href^="#help/"]')) close();
  });
}

/** A checkbox with its label to the right. */
export function checkbox(label, checked, onchange, attrs = {}) {
  const id = uid("c");
  const input = h("input", { type: "checkbox", id, checked, onchange, ...attrs });
  return { input, el: h("label", { class: "check", for: id }, input, h("span", { text: label })) };
}

/** A message area for errors and notes. */
export function message(kind, text) {
  return h("p", { class: `msg msg-${kind}`, role: kind === "error" ? "alert" : null, text });
}

export function formatDate(iso) {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function formatNumber(n) {
  return new Intl.NumberFormat().format(n);
}

/**
 * Copies text. Calls the Clipboard API in the click handler. If it fails,
 * selects the text in `fallbackEl` so the user can copy it by hand.
 * @returns {Promise<boolean>}
 */
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl?.select) {
      fallbackEl.focus();
      fallbackEl.select();
    } else if (fallbackEl) {
      const range = document.createRange();
      range.selectNodeContents(fallbackEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return false;
  }
}

/** "1 card", "2 cards". */
export function plural(n, one, many = `${one}s`) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
