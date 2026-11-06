// Card display that follows Scryfall's image rules (PLAN.md section 4.5):
// no crop, no overlay, no filter, no transform, the aspect ratio kept, and
// all controls and markers outside the image. The color glow is a shadow on
// the frame around the image, never on the image itself.

import { cardKey, imageAlt, needsTextVersion, rarityName, legalityName } from "../cards.js";
import { announce, h, replace } from "./dom.js";

const SIZES = {
  large: { width: 672, height: 936 },
  normal: { width: 488, height: 680 },
  small: { width: 146, height: 204 },
};

/** The glow class for a card: one color, several colors, or colorless. */
export function glowClass(snapshot) {
  const id = snapshot.colorIdentity ?? [];
  if (id.length === 0) return "glow-c";
  if (id.length > 1) return "glow-m";
  return `glow-${id[0].toLowerCase()}`;
}

/**
 * Mana symbols as small colored pips, for example {2}{R}{R}. Text only, so
 * screen readers read the cost as written.
 * @param {string} cost
 */
export function manaCost(cost) {
  if (!cost) return null;
  const parts = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  return h("span", { class: "mana-cost", "aria-label": `Mana cost ${cost}`, role: "img" },
    parts.map((p) => {
      const colors = p.split("/").filter((c) => "WUBRG".includes(c));
      const cls = colors.length === 1 ? `pip pip-${colors[0].toLowerCase()}` : colors.length > 1 ? "pip pip-m" : "pip pip-c";
      return h("span", { class: cls, "aria-hidden": "true", text: p.replace("/", "") });
    }));
}

/** The text version of a card, for missing or failed images. */
export function cardText(snapshot) {
  return h("div", { class: "card-text", role: "img", "aria-label": imageAlt(snapshot) },
    h("p", { class: "card-text-name" }, snapshot.name, snapshot.manaCost ? h("span", { class: "mana", text: ` ${snapshot.manaCost}` }) : null),
    h("p", { class: "card-text-type", text: snapshot.typeLine }),
    snapshot.oracleText ? h("p", { class: "card-text-rules", text: snapshot.oracleText }) : null);
}

/**
 * The image part of a card, with a "Show other face" button for cards with
 * two face images. The button is outside the image.
 * @param {import("../cards.js").CardSnapshot} snapshot
 * @param {{size?: "large"|"normal"|"small", lazy?: boolean}} [opts]
 */
export function cardMedia(snapshot, opts = {}) {
  const size = opts.size ?? "normal";
  const { width, height } = SIZES[size];
  const media = h("div", { class: `card-media card-media-${size}` });
  const wrap = h("div", { class: "card-media-wrap" }, media);

  if (needsTextVersion(snapshot)) {
    media.classList.add("is-text");
    media.append(cardText(snapshot));
    return wrap;
  }

  const pick = (img) => img[size] ?? img.normal ?? img.small;
  const images = snapshot.images.filter((img) => pick(img));
  let face = 0;
  const img = h("img", {
    alt: imageAlt(snapshot),
    width,
    height,
    decoding: "async",
    loading: opts.lazy ? "lazy" : null,
    src: pick(images[0]),
  });
  img.addEventListener("error", () => {
    media.classList.add("is-text");
    replace(media, cardText(snapshot));
    flip?.remove();
  });
  media.append(img);

  let flip = null;
  if (images.length > 1) {
    flip = h("button", {
      type: "button",
      class: "flip",
      "aria-pressed": "false",
      text: "Show other face",
      onclick: () => {
        face = (face + 1) % images.length;
        img.src = pick(images[face]);
        flip.setAttribute("aria-pressed", String(face !== 0));
        announce(face === 0 ? "Showing the front face." : "Showing the other face.");
      },
    });
    wrap.append(flip);
  }
  return wrap;
}

/**
 * "Saved in Elf deck", "Saved in Elf deck and 2 more", or "".
 * @param {{listName: string}[]} places
 */
export function savedText(places) {
  if (places.length === 0) return "";
  if (places.length === 1) return `Saved in ${places[0].listName}`;
  return `Saved in ${places[0].listName} and ${places.length - 1} more`;
}

/** Fills a saved marker element. */
export function fillSaved(el, places) {
  const text = savedText(places);
  el.textContent = text ? `★ ${text}` : "";
  el.hidden = !text;
  el.title = places.map((p) => `${p.listName} (${p.quantity})`).join(", ");
}

const LEGAL_SHORT = [["standard", "Standard"], ["standardbrawl", "Std Brawl"], ["brawl", "Brawl"]];

/** Short nerd-mode stats: cost, power and toughness, price, rank, legality. */
function nerdStats(snapshot) {
  const pt = snapshot.power != null && snapshot.toughness != null ? `${snapshot.power}/${snapshot.toughness}`
    : snapshot.loyalty != null ? `Loyalty ${snapshot.loyalty}` : snapshot.defense != null ? `Defense ${snapshot.defense}` : null;
  const items = [
    ["Mana value", String(snapshot.manaValue ?? 0)],
    pt ? ["Stats", pt] : null,
    ["Set", `${(snapshot.set ?? "").toUpperCase()} #${snapshot.collectorNumber} · ${rarityName(snapshot.rarity)}`],
    snapshot.releasedAt ? ["Released", snapshot.releasedAt] : null,
    snapshot.prices?.usd ? ["Price", `$${snapshot.prices.usd}`] : null,
    snapshot.edhrecRank ? ["EDHREC rank", `#${snapshot.edhrecRank.toLocaleString()}`] : null,
  ].filter(Boolean);
  const legal = snapshot.legalities
    ? h("p", { class: "legal-mini" }, LEGAL_SHORT.map(([k, label]) => {
      const st = snapshot.legalities[k] ?? "not_legal";
      return h("span", { class: `legal-badge is-${st}`, title: `${label}: ${legalityName(st)}`, text: label });
    }))
    : null;
  return h("div", { class: "tile-stats nerd-only" },
    h("dl", {}, items.map(([k, v]) => h("div", {}, h("dt", { text: k }), h("dd", { text: v })))),
    legal);
}

/**
 * A card tile: image, name, saved marker, nerd stats, and actions. The tile
 * has `data-card-key` so markers can update when lists change.
 * @param {import("../cards.js").CardSnapshot} snapshot
 * @param {{saved?: {listName: string, quantity: number}[], onDetails?: () => void, onExplore?: () => void, onAdd?: () => void, extra?: Node[], lazy?: boolean, size?: "large"|"normal", index?: number}} [opts]
 */
export function cardTile(snapshot, opts = {}) {
  const savedEl = h("p", { class: "tile-saved" });
  fillSaved(savedEl, opts.saved ?? []);
  const tile = h("article", {
    class: `tile ${glowClass(snapshot)}`,
    dataset: { cardKey: cardKey(snapshot), mv: String(snapshot.manaValue ?? 0) },
    style: opts.index !== undefined ? `--i: ${Math.min(opts.index, 12)}` : null,
  },
  h("div", { class: "tile-frame" }, cardMedia(snapshot, { size: opts.size ?? "normal", lazy: opts.lazy })),
  h("div", { class: "tile-info" },
    h("div", { class: "tile-head" },
      h("h3", { class: "tile-name", text: snapshot.name }),
      manaCost(snapshot.manaCost)),
    h("p", { class: "tile-type", text: snapshot.typeLine }),
    savedEl,
    nerdStats(snapshot),
    opts.extra ?? null),
  h("div", { class: "tile-actions" },
    opts.onDetails ? h("button", { type: "button", class: "ghost", text: "Details", "aria-label": `Details for ${snapshot.name}`, onclick: opts.onDetails }) : null,
    opts.onExplore ? h("button", { type: "button", class: "ghost", text: "Explore", "aria-label": `Explore ${snapshot.name}: synergies, similar cards, and counters`, onclick: opts.onExplore }) : null,
    opts.onAdd ? h("button", { type: "button", class: "primary", text: "Add", "aria-label": `Add ${snapshot.name} to a list`, onclick: opts.onAdd }) : null));
  return tile;
}
