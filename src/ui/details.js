// Card details: everything about one card, for the details sheet and the
// inspector. Rulings load only when the user asks, through the API queue.

import { FORMAT_NAMES } from "../config.js";
import { legalityName, rarityName } from "../cards.js";
import { glossaryFor, wikiUrl } from "../glossary.js";
import { errorMessage } from "../scryfall.js";
import { cardMedia, glowClass, manaCost, savedText } from "./card-view.js";
import { announce, formatDate, h, message, replace } from "./dom.js";

/** Formats shown in the legality list, most relevant to Arena first. */
const LEGAL_FORMATS = ["standard", "standardbrawl", "brawl", "alchemy", "historic", "timeless", "pioneer", "commander"];
const LEGAL_NAMES = { ...FORMAT_NAMES, historic: "Historic", alchemy: "Alchemy", timeless: "Timeless" };

/** Rulings by Scryfall ID, for this session. */
const rulingsCache = new Map();

function section(title, ...children) {
  return h("section", { class: "detail-section" }, h("h3", { text: title }), ...children);
}

function link(href, text) {
  return href ? h("a", { href, target: "_blank", rel: "noopener", text }) : null;
}

function rulesText(text) {
  if (!text) return null;
  return h("div", { class: "oracle" }, text.split("\n").map((line) => (line ? h("p", { text: line }) : null)));
}

/**
 * The rulings area: a button that fetches rulings once, then the list.
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 */
function rulingsArea(app, snapshot) {
  const slot = h("div", { class: "rulings", "aria-live": "polite" });
  const show = (data) => {
    if (data.length === 0) return replace(slot, h("p", { class: "hint", text: "This card has no official rulings." }));
    replace(slot, h("ul", { class: "ruling-list" }, data.map((r) =>
      h("li", {}, h("p", { text: r.comment }), h("p", { class: "hint", text: `${r.source === "wotc" ? "Wizards of the Coast" : "Scryfall"}, ${r.published_at}` })))));
  };
  const cached = rulingsCache.get(snapshot.scryfallId);
  if (cached) {
    show(cached);
    return slot;
  }
  const btn = h("button", {
    type: "button",
    text: "Show rulings",
    onclick: async () => {
      btn.disabled = true;
      btn.textContent = "Loading rulings…";
      try {
        const res = await app.client.rulings(snapshot.scryfallId);
        const data = Array.isArray(res.data) ? res.data : [];
        rulingsCache.set(snapshot.scryfallId, data);
        show(data);
        announce(data.length ? `${data.length} ${data.length === 1 ? "ruling" : "rulings"}.` : "No rulings.");
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Show rulings";
        slot.append(message("error", errorMessage(e)));
      }
    },
  });
  slot.append(btn);
  return slot;
}

/**
 * Everything about one card.
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 * @param {{titleId?: string, headingLevel?: "h2", image?: boolean, onAdd?: () => void, onExplore?: () => void}} [opts]
 */
export function cardDetails(app, snapshot, opts = {}) {
  const s = snapshot;
  const old = s.legalities === undefined;
  const terms = glossaryFor(s);
  const places = app.savedIn(s);
  const pt = s.power != null && s.toughness != null ? `${s.power}/${s.toughness}`
    : s.loyalty != null ? `Loyalty ${s.loyalty}` : s.defense != null ? `Defense ${s.defense}` : null;

  const prices = s.prices ? [["USD", s.prices.usd, "$"], ["USD foil", s.prices.usdFoil, "$"], ["EUR", s.prices.eur, "€"], ["MTGO tix", s.prices.tix, ""]]
    .filter(([, v]) => v) : [];
  const buy = s.purchaseUris ? [["TCGplayer", s.purchaseUris.tcgplayer], ["Cardmarket", s.purchaseUris.cardmarket], ["Cardhoarder", s.purchaseUris.cardhoarder]].filter(([, v]) => v) : [];

  return h("div", { class: `details ${glowClass(s)}` },
    h("header", { class: "details-head" },
      h(opts.headingLevel ?? "h2", { id: opts.titleId ?? null, class: "details-name", text: s.name }),
      manaCost(s.manaCost)),
    h("p", { class: "details-type", text: [s.typeLine, pt].filter(Boolean).join(" · ") }),
    opts.image ? h("div", { class: "details-image" }, cardMedia(s, { size: "normal" })) : null,
    places.length ? h("p", { class: "tile-saved" }, `★ ${savedText(places)}`, places.length > 1 ? `: ${places.map((p) => p.listName).join(", ")}` : "") : null,
    (opts.onAdd || opts.onExplore) ? h("div", { class: "row wrap" },
      opts.onAdd ? h("button", { type: "button", class: "primary", text: "Add to list", onclick: opts.onAdd }) : null,
      opts.onExplore ? h("button", { type: "button", text: "Explore", onclick: opts.onExplore }) : null) : null,
    rulesText(s.oracleText),
    s.flavorText ? h("p", { class: "flavor", text: s.flavorText }) : null,
    terms.length ? section("Keywords and terms",
      h("dl", { class: "glossary" }, terms.map((t) => h("div", {},
        h("dt", {}, t.name, t.kind ? h("span", { class: "hint", text: ` · ${t.kind}` }) : null),
        h("dd", {}, t.text ?? "The app has no short explanation for this one yet. ", " ", link(wikiUrl(t.name), `${t.name} on the MTG Wiki`)))))) : null,
    section("Rulings", rulingsArea(app, s)),
    old
      ? message("info", "This card was saved before the app kept full details. Select Refresh card data in its list to see legality, prices, and links.")
      : section("Legal in",
        h("ul", { class: "legal-list" }, LEGAL_FORMATS.map((k) => {
          const st = s.legalities[k] ?? "not_legal";
          return h("li", { class: `legal-badge is-${st}` }, h("span", { text: LEGAL_NAMES[k] ?? k }), h("span", { class: "visually-hidden", text: `: ${legalityName(st)}` }));
        })),
        s.gameChanger ? h("p", { class: "hint", text: "On the Commander Game Changers list." }) : null),
    section("Printing",
      h("dl", { class: "facts" },
        [["Set", `${s.setName} (${(s.set ?? "").toUpperCase()}) #${s.collectorNumber}`], ["Rarity", rarityName(s.rarity)],
          ["Released", s.releasedAt], ["Artist", s.artist], ["EDHREC rank", s.edhrecRank ? `#${s.edhrecRank.toLocaleString()} in Commander decks` : null]]
          .filter(([, v]) => v).map(([k, v]) => h("div", {}, h("dt", { text: k }), h("dd", { text: v }))))),
    (prices.length || buy.length) ? section("Prices and buying",
      prices.length ? h("dl", { class: "facts" }, prices.map(([k, v, cur]) => h("div", {}, h("dt", { text: k }), h("dd", { text: `${cur}${v}` })))) : null,
      prices.length ? h("p", { class: "hint", text: `Prices from Scryfall as of ${formatDate(s.fetchedAt)}. They change daily.` }) : null,
      buy.length ? h("p", { class: "row wrap links" }, buy.map(([k, v]) => link(v, `Buy on ${k}`))) : null) : null,
    s.allParts?.length ? section("Related cards and tokens",
      h("ul", { class: "plain" }, s.allParts.map((p) => h("li", { text: `${p.name}${p.typeLine ? ` · ${p.typeLine}` : ""}` })))) : null,
    section("Links",
      h("p", { class: "row wrap links" },
        link(s.scryfallUri, "View on Scryfall"),
        link(s.relatedUris?.edhrec, "EDHREC"),
        link(s.relatedUris?.gatherer, "Gatherer"))));
}

/**
 * Opens the details sheet: a dialog at the side on wide screens and at the
 * bottom on phones. Escape or Close returns focus to where it was.
 * @param {import("../main.js").App} app
 * @param {import("../cards.js").CardSnapshot} snapshot
 * @param {{onAdd?: () => void, onExplore?: () => void}} [opts]
 */
export function openDetails(app, snapshot, opts = {}) {
  const returnFocus = document.activeElement;
  const dialog = h("dialog", { class: "sheet", "aria-labelledby": "details-title" });
  const close = (restore = true) => {
    dialog.close();
    dialog.remove();
    if (restore && returnFocus instanceof HTMLElement) returnFocus.focus();
  };
  const closeBtn = h("button", { type: "button", class: "sheet-close", text: "Close", onclick: () => close() });
  const wrap = (fn) => (fn ? () => { close(false); fn(); } : undefined);
  dialog.append(
    h("div", { class: "sheet-bar" }, closeBtn),
    cardDetails(app, snapshot, { titleId: "details-title", image: true, onAdd: wrap(opts.onAdd), onExplore: wrap(opts.onExplore) }));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  closeBtn.focus();
  announce(`Details for ${snapshot.name}.`);
}

/**
 * The inspector: a panel beside the results on wide screens. It shows the
 * card under the pointer or keyboard focus. It sends no requests unless the
 * user selects Show rulings.
 * @param {import("../main.js").App} app
 */
export function createInspector(app) {
  const body = h("div", { class: "inspector-body" },
    h("p", { class: "hint", text: "Point at a card, or move the keyboard focus to it, to see everything about it here." }));
  const el = h("aside", { id: "inspector", class: "inspector", "aria-label": "Card inspector" }, body);
  let current = null;
  let timer = null;
  return {
    el,
    /** @param {import("../cards.js").CardSnapshot} snapshot */
    show(snapshot, opts = {}) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (current === snapshot.scryfallId && !opts.force) return;
        current = snapshot.scryfallId;
        replace(body, cardDetails(app, snapshot, { headingLevel: "h2", onAdd: opts.onAdd, onExplore: opts.onExplore }));
      }, opts.now ? 0 : 120);
    },
    refresh() {
      current = null;
    },
  };
}
