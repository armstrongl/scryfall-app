// App-wide constants. Change the app name here and nowhere else.

/** The working title. The owner can change it in this one place. */
export const APP_NAME = "Card discovery";

/** Short ID used in backup files and storage names. Do not change after release. */
export const APP_ID = "card-discovery";

export const API_BASE = "https://api.scryfall.com";
export const SCRYFALL_SITE = "https://scryfall.com";

/** Scryfall requires an Accept header on every API request. */
export const ACCEPT_HEADER = "application/json;q=0.9,*/*;q=0.8";

/** Minimum time between the start of two API requests (strictest Scryfall limit). */
export const REQUEST_SPACING_MS = 500;

/** How long Scryfall blocks a client after a 429 response. */
export const RATE_LIMIT_PAUSE_MS = 30_000;

/** Scryfall rejects a q value longer than this many Unicode characters. */
export const MAX_QUERY_LENGTH = 1000;

/** Wait this long after the last criteria change before asking for the pool size. */
export const POOL_DEBOUNCE_MS = 800;

export const MIN_DRAW = 1;
export const MAX_DRAW = 10;
/** A batch makes at most this many attempts for each requested card. */
export const DRAW_ATTEMPT_FACTOR = 3;

export const HISTORY_LIMIT = 100;

/** POST /cards/collection accepts at most this many identifiers. */
export const COLLECTION_BATCH_SIZE = 75;

/** Show the backup reminder when the last backup is older than this. */
export const BACKUP_REMINDER_DAYS = 14;

export const BACKUP_SCHEMA_VERSION = 1;

export const DB_NAME = "card-discovery";
export const DB_VERSION = 1;

/**
 * Legality keys, copied from the `legalities` object of a real Card object
 * (tests/fixtures/card-normal.json, fetched 2026-11-05). A test checks that
 * this list matches the fixture.
 */
export const FORMAT_KEYS = [
  "standard", "future", "historic", "timeless", "gladiator", "pioneer",
  "modern", "legacy", "pauper", "vintage", "penny", "commander",
  "oathbreaker", "standardbrawl", "brawl", "competitivebrawl", "alchemy",
  "paupercommander", "duel", "oldschool", "premodern", "predh", "tlr",
];

/**
 * Readable names for legality keys. Keys without a confirmed name show the
 * key only, so the app does not guess.
 */
export const FORMAT_NAMES = {
  standard: "Standard",
  future: "Future Standard",
  historic: "Historic",
  timeless: "Timeless",
  gladiator: "Gladiator",
  pioneer: "Pioneer",
  modern: "Modern",
  legacy: "Legacy",
  pauper: "Pauper",
  vintage: "Vintage",
  penny: "Penny Dreadful",
  commander: "Commander",
  oathbreaker: "Oathbreaker",
  standardbrawl: "Standard Brawl",
  brawl: "Brawl",
  alchemy: "Alchemy",
  paupercommander: "Pauper Commander",
  duel: "Duel Commander",
  oldschool: "Old School",
  premodern: "Premodern",
  predh: "PreDH",
};

export const CARD_TYPES = [
  "artifact", "battle", "creature", "enchantment", "instant", "land",
  "planeswalker", "sorcery",
];

export const COLORS = ["w", "u", "b", "r", "g"];
export const COLOR_NAMES = { w: "White", u: "Blue", b: "Black", r: "Red", g: "Green" };

export const RARITIES = ["common", "uncommon", "rare", "mythic"];

export const SECTIONS = ["main", "sideboard", "maybe"];
export const SECTION_NAMES = { main: "Main deck", sideboard: "Sideboard", maybe: "Maybe" };

/**
 * The notice that the Wizards of the Coast Fan Content Policy requires,
 * copied from https://company.wizards.com/en/legal/fancontentpolicy with the
 * title placeholder replaced by the app name.
 */
export const FAN_CONTENT_NOTICE =
  `${APP_NAME} is unofficial Fan Content permitted under the Fan Content Policy. ` +
  "Not approved/endorsed by Wizards. Portions of the materials used are property of " +
  "Wizards of the Coast. ©Wizards of the Coast LLC.";
