// The "Find synergies" panel. It lists searches for cards that may work with
// one card. Choosing one loads it into Discover. The panel itself sends no
// requests. It uses a <dialog> element, which is part of the page, not a
// browser dialog.

import { suggestSynergies, synergyCriteria } from "../synergy.js";
import { announce, h, message } from "./dom.js";

/**
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 */
export function openSynergyPanel(app, snapshot) {
  const returnFocus = document.activeElement;
  const suggestions = suggestSynergies(snapshot);

  const dialog = h("dialog", { class: "panel", "aria-labelledby": "synergy-title" });
  const close = (restoreFocus = true) => {
    dialog.close();
    dialog.remove();
    if (restoreFocus && returnFocus instanceof HTMLElement) returnFocus.focus();
  };

  function use(suggestion) {
    const criteria = synergyCriteria(app.settings.lastCriteria, snapshot, suggestion);
    close(false);
    const colors = criteria.colors.length ? ", and includes only cards in this card's colors" : "";
    app.showInDiscover(criteria, `Cards that may work with ${snapshot.name}: ${suggestion.label}. The search keeps your format and game${colors}. Change the criteria to widen or narrow it.`);
  }

  const items = suggestions.map((s) =>
    h("li", { class: "synergy" },
      h("h3", { text: s.label }),
      h("p", { class: "hint", text: s.reason }),
      h("p", { class: "query-wrap" }, h("code", { class: "query", text: s.query })),
      h("button", {
        type: "button",
        "aria-label": `Search in Discover: ${s.label}`,
        text: "Search in Discover",
        onclick: () => use(s),
      })));

  const closeBtn = h("button", { type: "button", text: "Close", onclick: () => close() });
  dialog.append(
    h("h2", { id: "synergy-title", text: `Find synergies for ${snapshot.name}` }),
    suggestions.length
      ? h("p", { class: "hint", text: "The app suggests these searches from the card's rules text and types. Some matches are loose, so check the cards before you use them." })
      : message("info", "The app found no patterns in this card's rules text to search for. Try a search in Discover with your own criteria."),
    suggestions.length ? h("ul", { class: "synergy-list" }, items) : null,
    h("div", { class: "row" }, closeBtn));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  (dialog.querySelector(".synergy button") ?? closeBtn).focus();
  announce(suggestions.length
    ? `${suggestions.length} ${suggestions.length === 1 ? "search" : "searches"} for cards that may work with ${snapshot.name}.`
    : `No synergy searches for ${snapshot.name}.`);
}
