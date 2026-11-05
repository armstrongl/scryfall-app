// Runs the API checks from PLAN.md section 9 against the live Scryfall API.
// Follows the Scryfall rules: Accept header, descriptive User-Agent, and at
// least 500 ms between requests. Run: node scripts/check-api.mjs
import { buildQuery, emptyCriteria } from "../src/query.js";

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
