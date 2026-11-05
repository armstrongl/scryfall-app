// Card display that follows Scryfall's image rules (PLAN.md section 4.5):
// no crop, no overlay, no filter, the aspect ratio kept, and all controls
// outside the image.

import { imageAlt, needsTextVersion, rarityName } from "../cards.js";
import { announce, h, replace } from "./dom.js";

const SIZES = {
  normal: { width: 488, height: 680 },
  small: { width: 146, height: 204 },
};

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
 * @param {{size?: "normal"|"small", lazy?: boolean}} [opts]
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

  const images = snapshot.images.filter((img) => img[size] || img.normal);
  let face = 0;
  const img = h("img", {
    alt: imageAlt(snapshot),
    width,
    height,
    decoding: "async",
    loading: opts.lazy ? "lazy" : null,
    src: images[0][size] ?? images[0].normal,
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
        img.src = images[face][size] ?? images[face].normal;
        flip.setAttribute("aria-pressed", String(face !== 0));
        announce(face === 0 ? "Showing the front face." : "Showing the other face.");
      },
    });
    wrap.append(flip);
  }
  return wrap;
}

/**
 * A full card: image, details, and actions.
 * @param {import("../cards.js").CardSnapshot} snapshot
 * @param {{onAdd?: () => void, extra?: Node[], lazy?: boolean}} [opts]
 */
export function cardView(snapshot, opts = {}) {
  return h("article", { class: "card" },
    cardMedia(snapshot, { size: "normal", lazy: opts.lazy }),
    h("div", { class: "card-info" },
      h("h3", { class: "card-name", text: snapshot.name }),
      h("p", { class: "card-type", text: snapshot.typeLine }),
      h("p", { class: "card-set", text: `${snapshot.setName} · ${rarityName(snapshot.rarity)}` }),
      opts.extra ?? null),
    h("div", { class: "card-actions" },
      h("a", { href: snapshot.scryfallUri, target: "_blank", rel: "noopener", class: "button", text: "View on Scryfall" }),
      opts.onAdd ? h("button", { type: "button", class: "primary", text: "Add to list", onclick: opts.onAdd }) : null));
}
