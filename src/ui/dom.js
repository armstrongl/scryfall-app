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

/** A labeled field: label above a control. */
export function field(label, control, hint) {
  const id = control.id || uid();
  control.id = id;
  const hintEl = hint ? h("p", { class: "hint", id: `${id}-hint`, text: hint }) : null;
  if (hintEl) control.setAttribute("aria-describedby", hintEl.id);
  return h("div", { class: "field" }, h("label", { for: id, text: label }), control, hintEl);
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
