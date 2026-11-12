// App-wide constants. Change the app name here and nowhere else.

/** The app name. Change it here; README.md lists the other places it appears. */
export const APP_NAME = "Cascade";

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
export const MAX_DRAW = 30;
/** A batch makes at most this many attempts for each requested card. */
export const DRAW_ATTEMPT_FACTOR = 3;
/**
 * Scryfall sends up to 175 cards a search page. A pool this size or smaller
 * is drawn from one search page instead of one request per card.
 */
export const SMALL_POOL_SIZE = 175;

export const HISTORY_LIMIT = 100;

/** POST /cards/collection accepts at most this many identifiers. */
export const COLLECTION_BATCH_SIZE = 75;

/** Show the backup reminder when the last backup is older than this. */
export const BACKUP_REMINDER_DAYS = 14;

/**
 * Version 2 added the commander section, deck formats other than Standard,
 * and card detail fields. Version 3 added deletion markers, so that a
 * delete reaches every synced device. Version 1 and 2 backups still import.
 */
export const BACKUP_SCHEMA_VERSION = 3;
/** Backup versions this app can read. */
export const READABLE_BACKUP_VERSIONS = [1, 2, 3];

export const DB_NAME = "card-discovery";
/** Version 2 added the deletions store. */
export const DB_VERSION = 2;

// GitHub sync -----------------------------------------------------------------

/** The GitHub REST API. Only src/github.js sends requests to it. */
export const GITHUB_API = "https://api.github.com";
export const GITHUB_ACCEPT = "application/vnd.github+json";
/** The REST API version that the GitHub client was written for. */
export const GITHUB_API_VERSION = "2022-11-28";
/** The file that sync keeps in the connected repository. Do not change after release. */
export const SYNC_FILE_NAME = `${APP_ID}-sync.json`;
/** Wait this long after the last change before syncing. */
export const SYNC_DEBOUNCE_MS = 5000;
/** When the app comes back into view, sync if the last sync is older than this. */
export const SYNC_ON_SHOW_MS = 60_000;
/** A sync reads and writes again at most this many times when another device wrote first. */
export const SYNC_MAX_TRIES = 3;
/** Deletion markers older than this are removed. */
export const DELETION_KEEP_DAYS = 90;
/**
 * Settings that sync. The others, such as the last search and the last
 * backup date, belong to one device.
 */
export const SYNCED_SETTINGS = ["density", "discoverMode", "browseSort"];

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

/**
 * Commander Spellbook, a combo database. The app only links to its site and
 * never sends it requests: its API refuses browser requests from other
 * sites. See src/combos.js.
 */
export const SPELLBOOK_SITE = "https://commanderspellbook.com";

export const CARD_TYPES = [
  "artifact", "battle", "creature", "enchantment", "instant", "land",
  "planeswalker", "sorcery",
];

export const COLORS = ["w", "u", "b", "r", "g"];
export const COLOR_NAMES = { w: "White", u: "Blue", b: "Black", r: "Red", g: "Green" };

export const RARITIES = ["common", "uncommon", "rare", "mythic"];

export const SECTIONS = ["commander", "main", "sideboard", "maybe"];
export const SECTION_NAMES = { commander: "Commander", main: "Main deck", sideboard: "Sideboard", maybe: "Maybe" };

/**
 * Deck formats a list can be checked against. Keys are Scryfall legality keys.
 * Brawl is Arena's 100-card Brawl (formerly Historic Brawl). Rules:
 * https://magic.wizards.com/en/formats/brawl
 */
export const DECK_FORMATS = ["standard", "standardbrawl", "brawl"];
export const DECK_FORMAT_NAMES = { standard: "Standard", standardbrawl: "Standard Brawl", brawl: "Brawl" };

/**
 * The notice that the Wizards of the Coast Fan Content Policy requires,
 * copied from https://company.wizards.com/en/legal/fancontentpolicy with the
 * title placeholder replaced by the app name.
 */
export const FAN_CONTENT_NOTICE =
  `${APP_NAME} is unofficial Fan Content permitted under the Fan Content Policy. ` +
  "Not approved/endorsed by Wizards. Portions of the materials used are property of " +
  "Wizards of the Coast. ©Wizards of the Coast LLC.";
