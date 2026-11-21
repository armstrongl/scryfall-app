// The criteria builder form (PLAN.md section 4.1). The basic filters are
// always shown. The filters added after v1 are in groups that open and
// close: Card, Creature, Printing, and Popularity.

import { CARD_TYPES, COLOR_NAMES, COLORS, FORMAT_KEYS, FORMAT_NAMES, RARITIES } from "../config.js";
import { TIPS } from "../docs.js";
import {
  ABILITY_COUNTS, CARD_ROLES, CREATURE_KEYWORDS, POPULARITY, abilityCountName, filterGroupCounts, normalizeCriteria,
} from "../query.js";
import { rarityName } from "../cards.js";
import { errorMessage } from "../scryfall.js";
import { announce, checkbox, field, h, helpLink, infoTip, replace, uid } from "./dom.js";

/** The most sets the Set list shows at once, besides the ticked ones. */
const SET_RESULTS = 8;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function select(options, onchange) {
  return h("select", { onchange }, options.map(([value, label]) => h("option", { value, text: label })));
}

function checkGroup(legend, items, onchange, name, tip) {
  const boxes = items.map(([value, label]) => checkbox(label, false, onchange, { value, name }));
  // With a ? button, the group is named by the legend's text only.
  const legendId = uid("legend");
  const legendEl = tip
    ? h("legend", {}, h("span", { id: legendId, text: legend }), infoTip(legend, tip))
    : h("legend", { text: legend });
  const el = h("fieldset", { class: "checks", "aria-labelledby": tip ? legendId : null }, legendEl, boxes.map((b) => b.el));
  return { el, boxes };
}

/** A number box with a fixed ID, so the browser checks can find it. */
function numberBox(id, oninput, attrs = {}) {
  return h("input", { type: "number", id, min: "0", step: "1", inputmode: "numeric", oninput, ...attrs });
}

/** A Minimum and Maximum pair under one legend, like Mana value. */
function rangeSet(legend, tip, min, max, labels = ["Minimum", "Maximum"]) {
  const legendId = uid("legend");
  return h("fieldset", { class: "mv", "aria-labelledby": legendId },
    h("legend", {}, h("span", { id: legendId, text: legend }), tip ? infoTip(legend, tip) : null),
    h("div", { class: "grid-2" }, field(labels[0], min), field(labels[1], max)));
}

/**
 * @param {(criteria: import("../query.js").Criteria) => void} onChange
 * @param {{loadSets?: () => Promise<{code: string, name: string, released: string}[]>}} [options]
 *   loadSets gets the sets for the Set filter. It's called when the
 *   Printing group first opens.
 */
export function createCriteriaForm(onChange, options = {}) {
  let criteria = normalizeCriteria(null);
  // The readable name of the Scryfall search, for example from Explore.
  // Editing the search by hand drops it, because it no longer fits.
  let rawLabel = "";
  const emit = () => {
    criteria = read();
    syncDisabled();
    updateCounts();
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
  // The filters in groups.
  const roles = checkGroup("What the card does", CARD_ROLES.map((r) => [r.tag, r.label]), emit, "roles", TIPS.roles);
  const abilityCount = select([["", "Any"], ...ABILITY_COUNTS.map((a) => [a, abilityCountName(a)])], emit);
  abilityCount.id = "f-ability-count";
  const commander = checkbox("Can be your commander", false, emit, { id: "f-commander" });
  const creatureKeywords = checkGroup("Creature abilities", CREATURE_KEYWORDS.map((k) => [k, cap(k)]), emit, "creatureKeywords", TIPS.creatureAbilities);
  const powMin = numberBox("f-pow-min", emit);
  const powMax = numberBox("f-pow-max", emit);
  const touMin = numberBox("f-tou-min", emit);
  const touMax = numberBox("f-tou-max", emit);
  const yearMin = numberBox("f-year-min", emit, { min: "1993", max: "2100", placeholder: "1993" });
  const yearMax = numberBox("f-year-max", emit, { min: "1993", max: "2100" });
  const priceMax = numberBox("f-price-max", emit, { step: "0.01", inputmode: "decimal" });
  const popularity = select([["", "Any"], ...Object.entries(POPULARITY).map(([k, p]) => [k, p.name])], emit);
  popularity.id = "f-popularity";

  // Sets: a search box over the list from Scryfall, with the ticked sets
  // always shown first.
  /** @type {{code: string, name: string}[]} */
  let chosenSets = [];
  /** @type {{code: string, name: string, released: string}[]|null} */
  let allSets = null;
  let setsLoading = false;
  const setSearch = h("input", {
    type: "search", id: "f-set-search", autocomplete: "off", spellcheck: "false", disabled: true,
    placeholder: "Set name or code", oninput: () => renderSets(),
  });
  const setStatus = h("p", { class: "hint", id: "f-set-status", "aria-live": "polite", text: "The sets load when you open Printing." });
  setSearch.setAttribute("aria-describedby", setStatus.id);
  // Named by aria-label: a hidden legend in a .checks group would take the
  // group's full width and push the page wider on a phone.
  const setResults = h("fieldset", { class: "checks set-results", id: "f-set-results", "aria-label": "Sets" });

  function renderSets() {
    const text = setSearch.value.trim().toLowerCase();
    const chosen = new Set(chosenSets.map((s) => s.code));
    const known = new Map((allSets ?? []).map((s) => [s.code, s]));
    const matches = (allSets ?? [])
      .filter((s) => !chosen.has(s.code) && (!text || s.name.toLowerCase().includes(text) || s.code === text))
      .slice(0, SET_RESULTS);
    const box = (s, checked) => {
      const year = known.get(s.code)?.released?.slice(0, 4);
      const label = `${s.name} (${s.code.toUpperCase()}${year ? `, ${year}` : ""})`;
      return checkbox(label, checked, (e) => toggleSet(s, e.target.checked), { value: s.code, name: "sets" }).el;
    };
    replace(setResults, chosenSets.map((s) => box(s, true)), matches.map((s) => box(s, false)));
    if (allSets && text && matches.length === 0) setResults.append(h("p", { class: "hint", text: "No sets match." }));
  }

  function toggleSet(s, on) {
    chosenSets = on ? [...chosenSets.filter((x) => x.code !== s.code), { code: s.code, name: s.name }] : chosenSets.filter((x) => x.code !== s.code);
    emit();
    renderSets();
  }

  async function loadSets() {
    if (allSets || setsLoading || !options.loadSets) return;
    setsLoading = true;
    setStatus.textContent = "Loading the sets…";
    try {
      allSets = await options.loadSets();
      setSearch.disabled = false;
      setStatus.textContent = `${allSets.length.toLocaleString()} sets, newest first. Type to find one.`;
      announce("The sets are loaded.");
    } catch (e) {
      setStatus.textContent = `Couldn't load the sets. ${errorMessage(e)} To try again, close Printing and open it.`;
    } finally {
      setsLoading = false;
    }
    renderSets();
  }

  const rawQuery = h("textarea", { rows: "2", autocomplete: "off", spellcheck: "false", oninput: () => { rawLabel = ""; emit(); } });

  const mvLegendId = uid("legend");
  const hintSlots = {
    colors: h("p", { class: "hint field-hint", id: uid("hint") }),
    typeText: h("p", { class: "hint field-hint", id: uid("hint") }),
    mv: h("p", { class: "hint field-hint", id: uid("hint") }),
    keyword: h("p", { class: "hint field-hint", id: uid("hint") }),
    oracleText: h("p", { class: "hint field-hint", id: uid("hint") }),
    pow: h("p", { class: "hint field-hint", id: uid("hint") }),
    tou: h("p", { class: "hint field-hint", id: uid("hint") }),
    year: h("p", { class: "hint field-hint", id: uid("hint") }),
    price: h("p", { class: "hint field-hint", id: "f-price-max-hint" }),
  };
  for (const [key, inputs] of [["pow", [powMin, powMax]], ["tou", [touMin, touMax]], ["year", [yearMin, yearMax]], ["price", [priceMax]]]) {
    for (const i of inputs) i.setAttribute("aria-describedby", hintSlots[key].id);
  }
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
      popularity: popularity.value || null,
      yearMin: yearMin.value,
      yearMax: yearMax.value,
      sets: chosenSets,
      abilityCount: abilityCount.value || null,
      creatureKeywords: checked(creatureKeywords),
      powMin: powMin.value,
      powMax: powMax.value,
      touMin: touMin.value,
      touMax: touMax.value,
      roles: checked(roles),
      canBeCommander: commander.input.checked,
      priceMax: priceMax.value,
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
    popularity.value = criteria.popularity ?? "";
    yearMin.value = criteria.yearMin ?? "";
    yearMax.value = criteria.yearMax ?? "";
    chosenSets = criteria.sets.map((x) => ({ ...x }));
    abilityCount.value = criteria.abilityCount ?? "";
    for (const b of creatureKeywords.boxes) b.input.checked = criteria.creatureKeywords.includes(b.input.value);
    powMin.value = criteria.powMin ?? "";
    powMax.value = criteria.powMax ?? "";
    touMin.value = criteria.touMin ?? "";
    touMax.value = criteria.touMax ?? "";
    for (const b of roles.boxes) b.input.checked = criteria.roles.includes(b.input.value);
    commander.input.checked = criteria.canBeCommander;
    priceMax.value = criteria.priceMax ?? "";
    rawQuery.value = criteria.rawQuery;
    rawLabel = criteria.rawLabel;
    syncDisabled();
    renderSets();
    // A group with filters on opens, so its filters can be seen.
    const counts = updateCounts();
    for (const [key, g] of Object.entries(groups)) if (counts[key] > 0) g.el.open = true;
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

  /**
   * A group of filters that opens and closes. Its button says how many of
   * its filters are on.
   */
  function group(key, name, ...children) {
    const count = h("span", { class: "group-count" });
    const el = h("details", { class: "filter-group", dataset: { group: key } },
      h("summary", {}, h("span", { class: "group-name", text: name }), count),
      h("div", { class: "group-body" }, children));
    return { el, count };
  }
  const groups = {
    card: group("card", "Card",
      roles.el,
      field("Number of abilities", abilityCount, undefined, TIPS.abilityCount),
      field("Keyword ability", keyword, undefined, TIPS.keyword),
      hintSlots.keyword,
      field("Rules text", oracleText, undefined, TIPS.rulesText),
      hintSlots.oracleText,
      h("div", { class: "check-row" }, commander.el, infoTip("Can be your commander", TIPS.commander))),
    creature: group("creature", "Creature",
      creatureKeywords.el,
      rangeSet("Power", null, powMin, powMax),
      hintSlots.pow,
      rangeSet("Toughness", null, touMin, touMax),
      hintSlots.tou),
    printing: group("printing", "Printing",
      rangeSet("First printed", TIPS.firstPrinted, yearMin, yearMax, ["From year", "To year"]),
      hintSlots.year,
      field("Set", setSearch, undefined, TIPS.set),
      setStatus,
      setResults,
      field("Paper price at most (USD)", priceMax, undefined, TIPS.price),
      hintSlots.price),
    popularity: group("popularity", "Popularity",
      field("Popularity", popularity, undefined, TIPS.popularity)),
  };
  groups.printing.el.addEventListener("toggle", () => { if (groups.printing.el.open) loadSets(); });

  function updateCounts() {
    const counts = filterGroupCounts(read());
    for (const [key, g] of Object.entries(groups)) g.count.textContent = counts[key] ? `${counts[key]} on` : "";
    return counts;
  }

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
    h("div", { class: "filter-groups" }, Object.values(groups).map((g) => g.el)),
    field("Scryfall search", rawQuery, "Optional. Any Scryfall search syntax, such as t:goblin or o:\"draw a card\". It shows as a Custom search filter."),
    h("p", { class: "hint" }, helpLink("find-cards", "Learn more about filters")));

  return { el, set, get: () => criteria, showHints };
}
