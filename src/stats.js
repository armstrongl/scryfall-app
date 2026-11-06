// Deck statistics: mana curve, color pips, card types. Pure module.

/** Card types in the order a card is counted under. A land creature is a land. */
export const TYPE_ORDER = ["land", "creature", "planeswalker", "battle", "instant", "sorcery", "artifact", "enchantment"];

/** The type a card counts as, from the front face of its type line. */
export function primaryType(typeLine) {
  const front = (typeLine ?? "").split(" // ")[0].split("—")[0].toLowerCase();
  return TYPE_ORDER.find((t) => new RegExp(`\\b${t}\\b`).test(front)) ?? "other";
}

/**
 * Colored mana symbols in a mana cost. Hybrid symbols count for each color.
 * "{3}{W}{W}" gives {W: 2}. "{W/U}" gives {W: 1, U: 1}. "{G/P}" gives {G: 1}.
 * @param {string} manaCost
 */
export function countPips(manaCost) {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const [, sym] of (manaCost ?? "").matchAll(/\{([^}]+)\}/g)) {
    for (const c of new Set(sym.split("/"))) if (c in out) out[c] += 1;
  }
  return out;
}

/**
 * Statistics for the main deck entries (sideboard and maybe are left out).
 * The curve has buckets 0 to 7, where 7 means 7 or more. Lands are not in
 * the curve or the average.
 * @param {import("./lists.js").Entry[]} entries
 */
export function deckStats(entries) {
  const main = entries.filter((e) => e.section === "main" || e.section === "commander");
  const curve = new Array(8).fill(0);
  const types = Object.fromEntries([...TYPE_ORDER, "other"].map((t) => [t, 0]));
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let total = 0;
  let lands = 0;
  let mvSum = 0;
  for (const e of main) {
    const q = e.quantity;
    total += q;
    const type = primaryType(e.card.typeLine);
    types[type] += q;
    if (type === "land") {
      lands += q;
      continue;
    }
    curve[Math.min(7, Math.max(0, Math.floor(e.card.manaValue ?? 0)))] += q;
    mvSum += (e.card.manaValue ?? 0) * q;
    const p = countPips(e.card.manaCost);
    for (const c of Object.keys(pips)) pips[c] += p[c] * q;
  }
  const spells = total - lands;
  return { total, lands, curve, types, pips, averageManaValue: spells ? mvSum / spells : 0 };
}
