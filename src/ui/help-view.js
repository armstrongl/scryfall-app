// The Help view: the help pages from src/docs.js, with a list of pages
// beside them on wide screens and above them on phones. Each page has its
// own address, such as #help/nerd-mode. Text is built with h(), never HTML.
// Links to other sites open in a new tab; links to help pages don't.

import { DOC_PAGES, docPage, inlineParts } from "../docs.js";
import { h, replace } from "./dom.js";

/** Text with **bold** UI labels and links, as nodes. */
function rich(text) {
  return inlineParts(text).map((p) => {
    const node = !p.href ? p.text
      : p.href.startsWith("#") ? h("a", { href: p.href, text: p.text })
        : h("a", { href: p.href, target: "_blank", rel: "noopener" }, p.text, h("span", { class: "visually-hidden", text: " (opens in a new tab)" }));
    return p.strong ? h("strong", {}, node) : node;
  });
}

/** @param {import("../docs.js").DocBlock} block */
function renderBlock(block) {
  if ("p" in block) return h("p", {}, rich(block.p));
  if ("steps" in block) return h("ol", { class: "help-steps" }, block.steps.map((s) => h("li", {}, rich(s))));
  if ("list" in block) return h("ul", { class: "help-list" }, block.list.map((s) => h("li", {}, rich(s))));
  return h("dl", { class: "help-terms" }, block.terms.map(([t, d]) => h("div", {}, h("dt", {}, rich(t)), h("dd", {}, rich(d)))));
}

export function createHelpView() {
  const links = DOC_PAGES.map((p) => h("a", { href: `#help/${p.id}`, dataset: { page: p.id }, text: p.title }));
  const nav = h("nav", { class: "help-nav", "aria-label": "Help pages" }, h("ul", {}, links.map((a) => h("li", {}, a))));
  const article = h("article", { class: "help-page", "aria-labelledby": "help-page-title" });

  const el = h("section", { class: "view", id: "view-help", "aria-labelledby": "help-title", hidden: true },
    h("div", { class: "view-head" },
      h("h1", { id: "help-title", class: "view-title", text: "Help" }),
      h("p", { class: "tagline", text: "How to use the app." })),
    h("div", { class: "help-layout" }, nav, article));

  /**
   * Shows a page. With focus, moves the keyboard focus to its heading.
   * @param {string|null} id
   * @param {{focus?: boolean}} [opts]
   */
  function show(id, opts = {}) {
    const page = docPage(id);
    for (const a of links) {
      if (a.dataset.page === page.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    const title = h("h2", { id: "help-page-title", class: "help-page-title", tabindex: "-1", text: page.title });
    replace(article,
      title,
      h("p", { class: "help-summary", text: page.summary }),
      page.sections.map((s) => h("section", { class: "help-section" },
        s.heading ? h("h3", { text: s.heading }) : null,
        s.blocks.map(renderBlock))));
    if (opts.focus) title.focus();
  }

  show(null);
  return { el, show };
}
