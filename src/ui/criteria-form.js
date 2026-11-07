// The criteria builder form (PLAN.md section 4.1).

import { CARD_TYPES, COLOR_NAMES, COLORS, FORMAT_KEYS, FORMAT_NAMES, RARITIES } from "../config.js";
import { TIPS } from "../docs.js";
import { normalizeCriteria } from "../query.js";
import { rarityName } from "../cards.js";
import { checkbox, field, h, helpLink, infoTip, uid } from "./dom.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function select(options, onchange) {
  return h("select", { onchange }, options.map(([value, label]) => h("option", { value, text: label })));
}

function checkGroup(legend, items, onchange) {
  const boxes = items.map(([value, label]) => {
    const c = checkbox(label, false, onchange, { value });
    return c;
  });
  const el = h("fieldset", { class: "checks" }, h("legend", { text: legend }), boxes.map((b) => b.el));
  return { el, boxes };
}

/**
 * @param {(criteria: import("../query.js").Criteria) => void} onChange
 */
export function createCriteriaForm(onChange) {
  let criteria = normalizeCriteria(null);
  // The readable name of the Scryfall search, for example from Explore.
  // Editing the search by hand drops it, because it no longer fits.
  let rawLabel = "";
  const emit = () => {
    criteria = read();
    syncDisabled();
    onChange(criteria);
  };

  const format = select(
    [["", "Any format"], ...FORMAT_KEYS.map((k) => [k, FORMAT_NAMES[k] ? `${FORMAT_NAMES[k]} (${k})` : k])],
    emit,
  );
  const game = select([["arena", "Arena"], ["mtgo", "MTGO"], ["paper", "Paper"], ["", "Any"]], emit);
  const rebalanced = checkbox("Exclude rebalanced cards", true, emit);
  const colorMode = select(
    [["any", "Any"], ["exactly", "Exactly"], ["atLeast", "At least"], ["atMost", "At most"]],
    emit,
  );
  const colors = checkGroup("Colors", COLORS.map((c) => [c, COLOR_NAMES[c]]), emit);
  const colorless = checkbox("Colorless", false, emit);
  const useIdentity = checkbox("Use color identity (for Commander and Brawl)", false, emit);
  const types = checkGroup("Card types", CARD_TYPES.map((t) => [t, cap(t)]), emit);
  const typeText = h("input", { type: "text", autocomplete: "off", spellcheck: "false", oninput: emit });
  const mvMin = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric", oninput: emit });
  const mvMax = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric", oninput: emit });
  const rarities = checkGroup("Rarity", RARITIES.map((r) => [r, rarityName(r)]), emit);
  const keyword = h("input", { type: "text", autocomplete: "off", spellcheck: "false", oninput: emit });
  const oracleText = h("input", { type: "text", autocomplete: "off", oninput: emit });
  const rawQuery = h("textarea", { rows: "2", autocomplete: "off", spellcheck: "false", oninput: () => { rawLabel = ""; emit(); } });

  const mvLegendId = uid("legend");
  const hintSlots = {
    colors: h("p", { class: "hint field-hint", id: uid("hint") }),
    typeText: h("p", { class: "hint field-hint", id: uid("hint") }),
    mv: h("p", { class: "hint field-hint", id: uid("hint") }),
    keyword: h("p", { class: "hint field-hint", id: uid("hint") }),
    oracleText: h("p", { class: "hint field-hint", id: uid("hint") }),
  };
  typeText.setAttribute("aria-describedby", hintSlots.typeText.id);
  keyword.setAttribute("aria-describedby", hintSlots.keyword.id);
  oracleText.setAttribute("aria-describedby", hintSlots.oracleText.id);
  mvMin.setAttribute("aria-describedby", hintSlots.mv.id);
  mvMax.setAttribute("aria-describedby", hintSlots.mv.id);

  function checked(group) {
    return group.boxes.filter((b) => b.input.checked).map((b) => b.input.value);
  }

  function read() {
    return normalizeCriteria({
      format: format.value || null,
      game: game.value || null,
      excludeRebalanced: rebalanced.input.checked,
      colorMode: colorMode.value,
      colors: checked(colors),
      colorless: colorless.input.checked,
      useIdentity: useIdentity.input.checked,
      types: checked(types),
      typeText: typeText.value,
      mvMin: mvMin.value === "" ? null : mvMin.value,
      mvMax: mvMax.value === "" ? null : mvMax.value,
      rarities: checked(rarities),
      keyword: keyword.value,
      oracleText: oracleText.value,
      rawQuery: rawQuery.value,
      rawLabel: rawQuery.value.trim() ? rawLabel : "",
    });
  }

  function syncDisabled() {
    const off = colorless.input.checked;
    colorMode.disabled = off;
    for (const b of colors.boxes) b.input.disabled = off;
  }

  /** @param {import("../query.js").Criteria} c */
  function set(c) {
    criteria = normalizeCriteria(c);
    format.value = criteria.format ?? "";
    game.value = criteria.game ?? "";
    rebalanced.input.checked = criteria.excludeRebalanced;
    colorMode.value = criteria.colorMode;
    for (const b of colors.boxes) b.input.checked = criteria.colors.includes(b.input.value);
    colorless.input.checked = criteria.colorless;
    useIdentity.input.checked = criteria.useIdentity;
    for (const b of types.boxes) b.input.checked = criteria.types.includes(b.input.value);
    typeText.value = criteria.typeText;
    mvMin.value = criteria.mvMin ?? "";
    mvMax.value = criteria.mvMax ?? "";
    for (const b of rarities.boxes) b.input.checked = criteria.rarities.includes(b.input.value);
    keyword.value = criteria.keyword;
    oracleText.value = criteria.oracleText;
    rawQuery.value = criteria.rawQuery;
    rawLabel = criteria.rawLabel;
    syncDisabled();
  }

  /** Shows the builder's hints next to their fields. */
  function showHints(hints) {
    for (const [key, el] of Object.entries(hintSlots)) {
      const hint = hints.find((x) => x.field === key);
      el.textContent = hint ? hint.message : "";
      el.hidden = !hint;
    }
  }
  showHints([]);

  colors.el.classList.add("mana-checks");
  for (const b of colors.boxes) b.el.classList.add(`mana-${b.input.value}`);
  const el = h("form", { class: "criteria", onsubmit: (e) => e.preventDefault(), "aria-label": "Criteria" },
    h("div", { class: "grid-2" },
      field("Format", format),
      field("Game", game, undefined, TIPS.game)),
    h("div", { class: "check-row" }, rebalanced.el, infoTip("Exclude rebalanced cards", TIPS.rebalanced)),
    h("div", { class: "grid-2" },
      field("Color mode", colorMode, undefined, TIPS.colorMode),
      h("div", { class: "field field-end" }, colorless.el)),
    colors.el,
    h("div", { class: "check-row" }, useIdentity.el, infoTip("Use color identity", TIPS.colorIdentity)),
    hintSlots.colors,
    types.el,
    field("Type line text", typeText, undefined, TIPS.typeLine),
    hintSlots.typeText,
    // The group is named by the legend's text only, so the ? button's name
    // doesn't join it.
    h("fieldset", { class: "mv", "aria-labelledby": mvLegendId },
      h("legend", {}, h("span", { id: mvLegendId, text: "Mana value" }), infoTip("Mana value", TIPS.manaValue)),
      h("div", { class: "grid-2" }, field("Minimum", mvMin), field("Maximum", mvMax))),
    hintSlots.mv,
    rarities.el,
    field("Keyword ability", keyword, undefined, TIPS.keyword),
    hintSlots.keyword,
    field("Rules text", oracleText, undefined, TIPS.rulesText),
    hintSlots.oracleText,
    field("Scryfall search", rawQuery, "Optional. Any Scryfall search syntax, such as t:goblin or o:\"draw a card\". It shows as a Custom search filter."),
    h("p", { class: "hint" }, helpLink("find-cards", "Learn more about filters")));

  return { el, set, get: () => criteria, showHints };
}
