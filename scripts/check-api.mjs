// Runs the API checks from PLAN.md section 9 against the live Scryfall API.
// Follows the Scryfall rules: Accept header, descriptive User-Agent, and at
// least 500 ms between requests. Run: node scripts/check-api.mjs
import { ABILITY_COUNTS, CARD_ROLES, buildQuery, emptyCriteria, setOptions } from "../src/query.js";
import { PARTNER_QUERIES, rewardsQuery } from "../src/synergy.js";
import { VERIFIED_TAGS } from "../src/explore.js";

const API = "https://api.scryfall.com";
const HEADERS = { Accept: "application/json;q=0.9,*/*;q=0.8", "User-Agent": "CardDiscoveryDev/0.1" };
let last = 0;
async function get(path) {
  const wait = last + 550 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(API + path, { headers: HEADERS });
  return { status: res.status, body: await res.json() };
}
const search = (q) => get(`/cards/search?q=${encodeURIComponent(q)}&unique=cards`);

console.log("## Arena printings (20 draws with the default query)");
const def = "f:standard game:arena -is:rebalanced";
let arenaOk = 0;
const nameFields = new Map();
for (let i = 0; i < 20; i++) {
  const { body } = await get(`/cards/random?q=${encodeURIComponent(def)}`);
  if (body.games?.includes("arena")) arenaOk++;
  for (const obj of [body, ...(body.card_faces ?? [])]) {
    for (const k of Object.keys(obj)) if (/name/.test(k) && k !== "name" && k !== "set_name") nameFields.set(k, (nameFields.get(k) ?? 0) + 1);
  }
}
console.log(`${arenaOk} of 20 drawn cards list "arena" in games.`);

console.log("\n## Rebalanced cards");
const a = await search("f:standard game:arena");
const b = await search("f:standard game:arena -is:rebalanced");
const r = await search("is:rebalanced");
console.log(`f:standard game:arena: ${a.body.total_cards}; with -is:rebalanced: ${b.body.total_cards}; is:rebalanced alone: ${r.status} ${r.body.total_cards ?? r.body.code}`);
const aNames = await search("f:standard game:arena name:/^A-/");
console.log(`Standard Arena cards whose name starts with "A-": ${aNames.status === 404 ? 0 : aNames.body.total_cards}`);

console.log("\n## Query syntax (one real search for each row of the table in section 4.1)");
const rows = {
  Format: { format: "standard" },
  Game: { game: "arena" },
  "Exclude rebalanced": { excludeRebalanced: true, format: "standard" },
  "Color exactly": { colorMode: "exactly", colors: ["w", "u"] },
  "Color at least": { colorMode: "atLeast", colors: ["w", "u"] },
  "Color at most": { colorMode: "atMost", colors: ["w", "u"] },
  Colorless: { colorless: true },
  "One type": { types: ["creature"] },
  "Two types": { types: ["creature", "instant"] },
  "Type line text": { typeText: "goblin" },
  "Type line text with a space": { typeText: "goblin warrior" },
  "Mana value range": { mvMin: 2, mvMax: 4 },
  "Mana value equal": { mvMin: 3, mvMax: 3 },
  "One rarity": { rarities: ["rare"] },
  "Two rarities": { rarities: ["rare", "mythic"] },
  Keyword: { keyword: "flying" },
  "Keyword with a space": { keyword: "first strike" },
  "Rules text": { oracleText: "draw a card" },
  "Raw query": { rawQuery: "t:elf or t:goblin" },
};
for (const [label, changes] of Object.entries(rows)) {
  const q = buildQuery({ ...emptyCriteria(), ...changes }).query;
  const { status, body } = await search(q);
  const warn = body.warnings?.length ? `WARNINGS: ${body.warnings.join(" | ")}` : "no warnings";
  console.log(`${label.padEnd(28)} ${q.padEnd(36)} ${status} ${body.total_cards ?? body.code} ${warn}`);
}

console.log("\n## Filters added after v1 (each one in Standard on Arena)");
console.log("Each row needs status 200, cards, and no warnings.");
const more = {
  "Popularity: staples": { popularity: "staple" },
  "Popularity: spicy": { popularity: "spicy" },
  "First printed from": { yearMin: 2025 },
  "First printed to": { yearMax: 2015 },
  "First printed in": { yearMin: 2024, yearMax: 2024 },
  "Set": { sets: [{ code: "dsk", name: "Duskmourn" }] },
  "Two sets": { sets: [{ code: "dsk", name: "Duskmourn" }, { code: "blb", name: "Bloomburrow" }] },
  ...Object.fromEntries(ABILITY_COUNTS.map((a) => [`Abilities: ${a}`, { abilityCount: a }])),
  "Creature abilities": { creatureKeywords: ["flying", "first strike"] },
  "Power and toughness": { powMin: 3, touMax: 3 },
  ...Object.fromEntries(CARD_ROLES.map((r) => [`Does: ${r.label}`, { roles: [r.tag] }])),
  "Can be your commander": { canBeCommander: true },
};
for (const [label, changes] of Object.entries(more)) {
  const q = buildQuery({ ...emptyCriteria(), format: "standard", game: "arena", ...changes }).query;
  const { status, body } = await search(q);
  const ok = status === 200 && body.total_cards > 0 && !body.warnings?.length;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(24)} ${q.padEnd(50)} ${status} ${body.total_cards ?? body.code}${body.warnings?.length ? ` WARNINGS: ${body.warnings.join(" | ")}` : ""}`);
}
const price = await search(buildQuery({ ...emptyCriteria(), game: "paper", priceMax: 1 }).query);
console.log(`${price.status === 200 && price.body.total_cards > 0 ? "ok  " : "BAD "} Paper price ${price.status} ${price.body.total_cards ?? price.body.code}`);
// Opt was first printed in 2000, and is on Arena only in later sets. With an
// age, the game filter must look at every printing, or Opt is lost.
const opt = await search(`!"Opt" ${buildQuery({ ...emptyCriteria(), game: "arena", yearMax: 2001 }).query}`);
console.log(`${opt.body.total_cards === 1 ? "ok  " : "BAD "} First printed checks every printing (Opt, 2000, on Arena): ${opt.status} ${opt.body.total_cards ?? opt.body.code}`);
// A known card for each Number of abilities choice, and one that must not match.
const abilityCards = [
  ["none", "Grizzly Bears", 1], ["keywords", "Serra Angel", 1], ["1", "Llanowar Elves", 1],
  ["2", "Thragtusk", 1], ["3plus", "Sheoldred, the Apocalypse", 1], ["2", "Llanowar Elves", 0],
];
for (const [count, name, want] of abilityCards) {
  const r = await search(`!"${name}" ${buildQuery({ ...emptyCriteria(), abilityCount: count }).query}`);
  const got = r.body.total_cards ?? 0;
  console.log(`${got === want ? "ok  " : "BAD "} Abilities ${count}: ${name} ${want ? "matches" : "doesn't match"} (${r.status} ${got})`);
}
// Brawl allows legendary planeswalkers as commanders.
const walker = await search(`!"Teferi, Hero of Dominaria" ${buildQuery({ ...emptyCriteria(), format: "brawl", canBeCommander: true }).query}`);
console.log(`${walker.body.total_cards === 1 ? "ok  " : "BAD "} Brawl commander: a legendary planeswalker matches (${walker.status} ${walker.body.total_cards ?? walker.body.code})`);
const sets = await get("/sets");
console.log(`${sets.status === 200 && setOptions(sets.body).some((x) => x.code === "dsk") ? "ok  " : "BAD "} The set list: ${sets.status}, ${setOptions(sets.body).length} sets to choose from`);

console.log("\n## Synergy queries (each partner query in src/synergy.js, in Standard on Arena)");
const synergy = { ...PARTNER_QUERIES, "rewards (Elf)": rewardsQuery("Elf"), "exclude a card": 't:elf -!"Llanowar Elves"' };
for (const [label, fragment] of Object.entries(synergy)) {
  const q = `${def} (${fragment})`;
  const { status, body } = await search(q);
  const warn = body.warnings?.length ? `WARNINGS: ${body.warnings.join(" | ")}` : "no warnings";
  console.log(`${label.padEnd(22)} ${status} ${body.total_cards ?? body.code} ${warn}`);
}

console.log("\n## Explore tags (each tag in VERIFIED_TAGS in src/explore.js, on Arena in any format)");
console.log("A tag with 0 cards or an error no longer exists. Remove it from VERIFIED_TAGS and from the queries that use it.");
for (const tag of VERIFIED_TAGS) {
  const { status, body } = await search(`otag:${tag} game:arena`);
  const ok = status === 200 && body.total_cards > 0;
  console.log(`${ok ? "ok  " : "GONE"} ${tag.padEnd(28)} ${status} ${body.total_cards ?? body.code}`);
}

console.log("\n## Error responses");
for (const q of ["mv>abc", "c=q", "asdf"]) {
  const { status, body } = await search(q);
  console.log(`${q}: status ${status}, code ${body.code}, details "${body.details}", warnings ${JSON.stringify(body.warnings ?? [])}`);
}

console.log("\n## Name fields other than name (from the 20 random draws)");
console.log(nameFields.size ? [...nameFields].map(([k, n]) => `${k} (${n})`).join(", ") : "none");
const flavor = await search("game:arena has:flavorname");
console.log(`game:arena has:flavorname: ${flavor.status} ${flavor.body.total_cards ?? flavor.body.code} ${flavor.body.warnings ? JSON.stringify(flavor.body.warnings) : ""}`);
if (flavor.body.data) {
  for (const c of flavor.body.data.slice(0, 5)) console.log(`  ${c.name} → flavor_name "${c.flavor_name ?? c.card_faces?.[0]?.flavor_name}" (${c.set})`);
}
