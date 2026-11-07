// The Explore panel: synergies, similar cards, counters, and combos for one
// card, in four tabs. Choosing a search opens it in Discover, in Browse mode,
// sorted by popularity. The Combos tab has links to Commander Spellbook
// instead, which open in a new tab. The panel itself sends no requests. It uses a
// <dialog> element, which is part of the page, not a browser dialog.

import { exploreCombos } from "../combos.js";
import { explore, exploreCriteria } from "../explore.js";
import { announce, closeOnHelpLink, h, helpLink, message } from "./dom.js";

const GROUPS = [
  { key: "synergies", label: "Synergies", intro: "Cards that work with this one. Searches use Scryfall's community tags and the card's rules text, so check the results.", empty: "The app found nothing in this card's rules text to build on. Try Similar.", note: (name, label) => `Cards that may work with ${name}: ${label}.` },
  { key: "similar", label: "Similar", intro: "Cards that do the same job, share keywords, or share a type and cost.", empty: "The app found nothing to compare this card with.", note: (name, label) => `Similar to ${name}: ${label}.` },
  { key: "counters", label: "Counters", intro: "Cards that answer this one. They're in every color, so add a color filter to fit your deck.", empty: "The app found no specific answers to this card.", note: (name, label) => `Answers to ${name}: ${label}.` },
  { key: "combos", label: "Combos", intro: "Combos with this card on Commander Spellbook, a separate combo database. Each link opens a search on their site in a new tab, in the format of your current search.", empty: "", external: true },
];

/**
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 */
export function openExplore(app, snapshot) {
  const returnFocus = document.activeElement;
  const result = { ...explore(snapshot), combos: exploreCombos(snapshot, app.settings.lastCriteria?.format ?? null) };
  const dialog = h("dialog", { class: "panel explore", "aria-labelledby": "explore-title" });
  const close = (restore = true) => {
    dialog.close();
    dialog.remove();
    if (restore && returnFocus instanceof HTMLElement) returnFocus.focus();
  };

  function use(group, s) {
    const criteria = exploreCriteria(app.settings.lastCriteria, snapshot, s, group.key);
    close(false);
    const colors = s.colors === "card" && criteria.colors.length ? " It stays in the card's colors." : "";
    app.showInDiscover(criteria, `${group.note(snapshot.name, s.label)} The search keeps your format and game.${colors} Most popular first.`, {
      mode: "browse",
      sort: { order: "edhrec", dir: "auto" },
    });
  }

  const tabs = [];
  const panels = [];
  GROUPS.forEach((g, i) => {
    const items = result[g.key];
    const tab = h("button", {
      type: "button",
      role: "tab",
      id: `explore-tab-${g.key}`,
      "aria-controls": `explore-panel-${g.key}`,
      "aria-selected": String(i === 0),
      tabindex: i === 0 ? "0" : "-1",
      class: "tab",
      onclick: () => select(i, true),
    }, g.label, h("span", { class: "tab-count", "aria-hidden": "true", text: ` ${items.length}` }));
    const panel = h("div", {
      role: "tabpanel",
      id: `explore-panel-${g.key}`,
      "aria-labelledby": tab.id,
      hidden: i !== 0,
      tabindex: "0",
    },
    h("p", { class: "hint", text: g.intro }),
    g.key === "combos" ? h("p", { class: "hint" }, helpLink("combos", "Learn more about combos and bracket tags")) : null,
    items.length
      ? h("ul", { class: "suggestion-list" }, items.map((s) =>
        h("li", { class: "suggestion" },
          h("div", { class: "suggestion-body" },
            h("h3", { text: s.label }),
            h("p", { class: "hint", text: s.reason })),
          g.external
            ? h("a", { href: s.url, target: "_blank", rel: "noopener", class: "button primary", text: "Open", "aria-label": `Open on Commander Spellbook: ${s.label}` })
            : h("button", { type: "button", class: "primary", text: "Search", "aria-label": `Search: ${s.label}`, onclick: () => use(g, s) }))))
      : message("info", g.empty));
    tabs.push(tab);
    panels.push(panel);
  });

  function select(i, focus) {
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(i === j));
      t.tabIndex = i === j ? 0 : -1;
      panels[j].hidden = i !== j;
    });
    if (focus) tabs[i].focus();
  }

  const tablist = h("div", {
    role: "tablist",
    "aria-label": "Explore",
    class: "tablist",
    onkeydown: (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(next, true);
    },
  }, tabs);

  const closeBtn = h("button", { type: "button", text: "Close", onclick: () => close() });
  dialog.append(
    h("div", { class: "row space" }, h("h2", { id: "explore-title", text: `Explore ${snapshot.name}` }), closeBtn),
    tablist,
    ...panels,
    h("p", { class: "hint explore-help" }, helpLink("explore", "Learn more about Explore")));
  closeOnHelpLink(dialog, () => close(false));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  tabs[0].focus();
  announce(`Explore ${snapshot.name}. ${GROUPS.filter((g) => !g.external).map((g) => `${result[g.key].length} ${g.label.toLowerCase()}`).join(", ")}, and links to combos.`);
}
