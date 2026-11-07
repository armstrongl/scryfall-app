// The help pages built into the app, shown in the Help view, and the text
// of every tooltip. Pure module: plain data and text helpers, no DOM. When
// the app changes, check these too (AGENTS.md, "Keep the docs in step").
//
// Text can mark a UI label in bold with **double asterisks**, and a link
// with [label](url). A link goes to an https:// address, which opens in a
// new tab, or to a help page, such as #help/combos. Nothing else is markup,
// and the Help view never parses HTML.

import {
  APP_NAME, BACKUP_REMINDER_DAYS, HISTORY_LIMIT, MAX_DRAW, MIN_DRAW, SCRYFALL_SITE, SMALL_POOL_SIZE, SPELLBOOK_SITE,
} from "./config.js";
import { FIND_MY_COMBOS_URL } from "./combos.js";
import { scryfallListUrls } from "./links.js";

/** The nerd mode tooltip. The Nerd mode help page repeats it word for word. */
export const NERD_MODE_TIP =
  "Nerd mode shows more details on every card: mana value, power and toughness, set and rarity, " +
  "release date, price, EDHREC rank, and legality in Standard and Brawl. Cards get smaller, so more fit on the screen.";

/**
 * Tooltip text, by key. A tooltip says what a control does or what a field
 * means, in one or two short sentences. It never holds the only copy of
 * something the user needs: the help pages say it too. docs/ui-copy.md lists
 * where each one is used.
 */
export const TIPS = {
  nerdMode: NERD_MODE_TIP,
  applyPreset: "Replaces the current filters with the filters in this preset.",
  savePreset: "Saves the current filters as a preset, so you can apply them again later.",
  drawMode: "Shows random cards that match your filters. A new draw prefers cards you haven't drawn recently.",
  browseMode: "Lists every card that matches your filters, in the order you choose.",
  openSearch: "Opens this search on the Scryfall website, in a new tab.",
  game: "Shows only cards you can play in this game: MTG Arena, Magic Online (MTGO), or paper.",
  rebalanced: "Leaves out rebalanced cards: digital-only versions that MTG Arena changed for balance. Their names start with A-.",
  colorMode: "How the colors you choose filter cards. Exactly: only those colors. At least: those colors and maybe more. At most: no other colors. Any: no color filter.",
  colorIdentity: "Matches the colors in a card's rules text as well as its cost, the way Commander and Brawl decks are built.",
  typeLine: "Matches words in the type line, such as Elf, Equipment, or Legendary.",
  manaValue: "The total amount of mana in a card's cost. For example, a card that costs {2}{G}{G} has a mana value of 4.",
  keyword: "Matches a keyword ability, such as flying, trample, or ward.",
  rulesText: "Matches words in the card's rules text, such as \"draw a card\".",
  exportArena: "Shows the deck as text to copy and import into MTG Arena.",
  findCombos: "Shows the list as text to paste into Find My Combos on Commander Spellbook.",
  openList: "Opens every card in this list on the Scryfall website, in a new tab.",
  refresh: "Gets current legality, prices, and images from Scryfall. Quantities, sections, and notes stay the same.",
  listKind: "A deck gets deck checks and stats for its format. A collection is a plain list of cards.",
  section: "Maybe holds cards you're considering, and the Arena export leaves it out. Commander holds a Brawl deck's commander.",
  edhrecRank: "How popular the card is in Commander decks on EDHREC. Rank 1 is in the most decks.",
  storage: "Persistent storage means the browser keeps the app's data even when the device runs low on space.",
};

// Links ------------------------------------------------------------------------------

const link = (text, href) => `[${text}](${href})`;
const WIZARDS = "https://magic.wizards.com/en";
const format = (text, key) => link(text, `${WIZARDS}/formats/${key}`);
/** A page on the MTG Wiki. Parentheses are escaped, so they don't end the link. */
const wiki = (text, page = text) =>
  link(text, `https://mtg.fandom.com/wiki/${encodeURIComponent(page.replace(/ /g, "_")).replace(/\(/g, "%28").replace(/\)/g, "%29")}`);
/** A card on Scryfall, as an exact-name search. */
const card = (name) => link(name, scryfallListUrls([name])[0]);
const help = (text, id) => link(text, `#help/${id}`);

const MTG = `${WIZARDS}`;
const ARENA = `${WIZARDS}/mtgarena`;
const RULES = `${WIZARDS}/rules`;
const BANNED = `${WIZARDS}/banned-restricted-list`;
const BRACKETS = `${WIZARDS}/formats/commander#brackets`;
const GAME_CHANGERS = `${WIZARDS}/formats/commander#gamechangers`;
const MTGO = "https://www.mtgo.com";
const SYNTAX = `${SCRYFALL_SITE}/docs/syntax`;
const SCRYFALL_API = `${SCRYFALL_SITE}/docs/api`;
const TAGGER = "https://tagger.scryfall.com";
const EDHREC = "https://edhrec.com";
const GATHERER = "https://gatherer.wizards.com";
const MTG_WIKI = "https://mtg.fandom.com/wiki/Main_Page";
const BRACKET_TAGS = `${SPELLBOOK_SITE}/syntax-guide/#bracket-tags`;
const SALT = `${SPELLBOOK_SITE}/salt/`;
const FAN_CONTENT_POLICY = "https://company.wizards.com/en/legal/fancontentpolicy";
const SAFARI_7_DAYS = "https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/";
const HOME_SCREEN = "https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios";
const STORAGE_LIMITS = "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria";
const INDEXEDDB = "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API";

/**
 * @typedef {{p: string} | {steps: string[]} | {list: string[]} | {terms: [string, string][]}} DocBlock
 * @typedef {{heading?: string, blocks: DocBlock[]}} DocSection
 * @typedef {{id: string, title: string, summary: string, sections: DocSection[]}} DocPage
 */

/** @type {DocPage[]} */
export const DOC_PAGES = [
  {
    id: "get-started",
    title: "Get started",
    summary: `What ${APP_NAME} does and where things are.`,
    sections: [
      {
        blocks: [
          { p: `${APP_NAME} helps you discover ${link("Magic: The Gathering", MTG)} cards, learn what they do, and see how they work together. It runs in your browser and gets card data and images from ${link("Scryfall", SCRYFALL_SITE)}. It has no server and no accounts.` },
          { p: `It's made for ${link("MTG Arena", ARENA)}, the digital version of the game, and its ${format("Standard", "standard")} and ${format("Brawl", "brawl")} formats. You can still search every card.` },
        ],
      },
      {
        heading: "The views",
        blocks: [
          {
            terms: [
              ["Discover", "Draw random cards, or browse every card that matches your filters."],
              ["Lists", "Your collections and decks, with deck checks, stats, and export for MTG Arena."],
              ["Data", "Back up your lists, restore a backup, and see how your data is stored."],
              ["Help", `These pages. The ${help("Glossary", "glossary")} explains the Magic terms the app uses.`],
            ],
          },
          { p: "On a phone, the views are in the row of tabs under the app name." },
        ],
      },
      {
        heading: "Draw your first cards",
        blocks: [
          {
            steps: [
              "Open **Discover**.",
              "Keep the **Arena Standard** preset, or choose another one.",
              "Select **Draw**.",
              "On a card, select **Details** to read everything about it, or **Add** to save it to a list.",
            ],
          },
        ],
      },
      {
        heading: "Help in the app",
        blocks: [
          { p: "Point at a button, or move the keyboard focus to it, to see a tooltip that says what it does. To see what a filter or setting means, select **?** next to it. Press Escape to hide a tooltip." },
          { p: "A **Learn more** link opens the help page about that part of the app." },
        ],
      },
    ],
  },
  {
    id: "find-cards",
    title: "Find cards",
    summary: "Presets, filters, random draws, and Browse all.",
    sections: [
      {
        heading: "Choose what to search",
        blocks: [
          { p: `A preset is a saved set of filters. The built-in presets are **Arena Standard**, for cards legal in ${format("Standard", "standard")} on MTG Arena, and **Arena Brawl**, for cards legal in ${format("Brawl", "brawl")} on MTG Arena, with colors read as ${wiki("color identity", "Color identity")}.` },
          {
            steps: [
              "Choose a preset, then select **Apply**.",
              `To narrow the search, select **Filters**. You can filter by ${wiki("format", "Format")}, game, colors, ${wiki("card types", "Card type")}, ${wiki("mana value", "Mana value")}, ${wiki("rarity", "Rarity")}, ${wiki("keywords", "Keyword ability")}, and ${wiki("rules text", "Oracle")}.`,
              "To keep your filters for later, select **Save as preset** and enter a name.",
            ],
          },
          { p: "Each active filter shows as a chip under the preset. To remove a filter, select **×** on its chip. The app shows how many cards match." },
          { p: `If you know ${link("Scryfall's search syntax", SYNTAX)}, type it in **Scryfall search** in the filters. Its chip says **Custom search**. A search from Explore shows where it came from instead, for example "Works with ${card("Lotus Cobra")}".` },
          { p: `To see the same search on the ${link("Scryfall", SCRYFALL_SITE)} website, select **Open on Scryfall**.` },
        ],
      },
      {
        heading: "Filters that need explaining",
        blocks: [
          {
            terms: [
              ["Game", `Where you can play the card: on MTG Arena, on ${link("Magic Online", MTGO)} (MTGO), or in paper.`],
              ["Exclude rebalanced cards", `Leaves out ${wiki("rebalanced cards", "Rebalanced card")}: digital-only versions that MTG Arena changed for balance. Their names start with A-.`],
              ["Color mode", "**Exactly** finds cards with only the colors you choose. **At least** finds cards with those colors and maybe more. **At most** finds cards with no other colors."],
              ["Use color identity", `Reads colors as ${wiki("color identity", "Color identity")}, which counts the mana symbols in a card's rules text too. Use it for ${format("Commander", "commander")} and Brawl decks.`],
            ],
          },
          { p: `To look up other terms, see the ${help("Glossary", "glossary")}.` },
        ],
      },
      {
        heading: "Draw random cards",
        blocks: [
          {
            steps: [
              "Select **Draw random**.",
              `Enter how many cards you want, ${MIN_DRAW} to ${MAX_DRAW} random cards at a time.`,
              "Select **Draw**. To stop early, select **Cancel**.",
            ],
          },
          { p: "When you draw again with the same filters, the app prefers cards you haven't drawn recently. It uses only the cards you drew for that same search. If there aren't enough new cards, it fills the draw with recent ones and tells you how many." },
          { p: `The app asks Scryfall for one card at a time, at most two a second, to stay within ${link("Scryfall's API limits", SCRYFALL_API)}. So a big draw takes a while. If ${SMALL_POOL_SIZE} cards or fewer match, the app gets them all at once and draws from them, which is fast.` },
          { p: `Your last ${HISTORY_LIMIT} cards are under **Recent draws**, at the bottom of Discover.` },
        ],
      },
      {
        heading: "Browse every match",
        blocks: [
          {
            steps: [
              "Select **Browse all**.",
              `Choose **Sort by** and **Order**, for example mana value, release date, or popularity on ${link("EDHREC", EDHREC)}.`,
              "Select **Show cards**. The app loads 175 cards at a time. Select **Load more** for the next ones.",
            ],
          },
        ],
      },
      {
        heading: "Saved cards",
        blocks: [
          { p: `A card you already saved shows **Saved in** and the name of the list. To save cards, see ${help("Lists and decks", "lists-and-decks")}.` },
        ],
      },
    ],
  },
  {
    id: "card-details",
    title: "Card details",
    summary: "Rules text, keywords, rulings, legality, and prices.",
    sections: [
      {
        blocks: [
          { p: "Select **Details** on a card to see:" },
          {
            list: [
              `The rules text, in its current official wording, called ${wiki("Oracle text", "Oracle")}.`,
              `What the card's keywords mean, with links to the ${link("MTG Wiki", MTG_WIKI)}.`,
              `The official rulings, which explain how the card works with the ${link("game rules", RULES)}. Select **Show rulings** to load them.`,
              `Legality in ${format("Standard", "standard")}, Standard Brawl, ${format("Brawl", "brawl")}, ${format("Alchemy", "alchemy")}, ${format("Historic", "historic")}, ${format("Timeless", "timeless")}, ${format("Pioneer", "pioneer")}, and ${format("Commander", "commander")}.`,
              `Whether the card is on the ${link("Commander Game Changers list", GAME_CHANGERS)}.`,
              `The printing, prices, and links to buy the card on ${link("TCGplayer", "https://www.tcgplayer.com")}, ${link("Cardmarket", "https://www.cardmarket.com")}, or ${link("Cardhoarder", "https://www.cardhoarder.com")}.`,
              `Links to the card on ${link("Scryfall", SCRYFALL_SITE)}, ${link("EDHREC", EDHREC)}, and ${link("Gatherer", GATHERER)}, the official card database, and to its combos on ${link("Commander Spellbook", SPELLBOOK_SITE)}.`,
            ],
          },
          { p: "**EDHREC rank** is how popular the card is in Commander decks on EDHREC. Rank 1 is in the most decks." },
          { p: "On a wide screen, point at a card, or move the keyboard focus to it, to see the same details in the panel beside the cards." },
          { p: `To look up a term, see the ${help("Glossary", "glossary")}.` },
        ],
      },
    ],
  },
  {
    id: "explore",
    title: "Explore",
    summary: "Synergies, similar cards, counters, and combos for any card.",
    sections: [
      {
        blocks: [
          {
            steps: [
              "Select **Explore** on any card, in Discover or in a list.",
              "Choose a tab.",
              "Select **Search** next to an idea. Discover opens that search in Browse all, most popular first.",
              `On the **Combos** tab, select **Open** instead. ${link("Commander Spellbook", SPELLBOOK_SITE)} opens in a new tab.`,
            ],
          },
          {
            terms: [
              ["Synergies", `Cards that work with this one, such as "Green cards that leverage ${wiki("landfall", "Landfall")}". They stay in the card's colors.`],
              ["Similar", `Cards that do the same job for a similar cost, share its ${wiki("keywords", "Keyword ability")}, or share its type and cost.`],
              ["Counters", `Cards that answer this one, such as creature ${wiki("removal", "Removal")} or cards that punish fliers. They're in every color.`],
              ["Combos", `Links to combos with this card on Commander Spellbook, in the format of your current search. A ${wiki("legendary", "Legendary")} creature or planeswalker also gets a link to combos in its colors, for a deck it leads. See the ${help("Combos", "combos")} help page.`],
            ],
          },
          { p: "The search keeps your format and game, and leaves out the card itself. Its chip in Discover says where it came from." },
          { p: `The ideas come from the card's rules text and from ${link("Scryfall Tagger", TAGGER)} tags, which the community maintains. Check the results before you build around them.` },
        ],
      },
    ],
  },
  {
    id: "combos",
    title: "Combos",
    summary: "Find card combos on Commander Spellbook, and learn what bracket tags mean.",
    sections: [
      {
        blocks: [
          { p: `A combo is a set of cards that work together to do something big, such as making infinite mana or winning the game. Cascade finds combos with ${link("Commander Spellbook", SPELLBOOK_SITE)}, a free combo database. It's a separate site: Cascade links to it and shows none of its data.` },
        ],
      },
      {
        heading: "Find combos",
        blocks: [
          {
            terms: [
              ["Combos tab", "In **Explore**, the **Combos** tab links to combos with the card, legal in the format of your current search."],
              ["Card details", "**Combos on Commander Spellbook**, under Links, opens the same search."],
              ["Find combos", `On a list, **Find combos** gets the list ready for Commander Spellbook's ${link("Find My Combos", FIND_MY_COMBOS_URL)} page.`],
            ],
          },
          {
            steps: [
              "Open a list in **Lists**.",
              "Select **Find combos**, then select **Copy**.",
              "Select **Open Find My Combos**.",
              "Paste the list into the decklist box, then select **Find New Combos**.",
            ],
          },
          { p: `Find My Combos shows the combos in your list, and the combos you're one card away from. It shows combos legal in ${format("Commander", "commander")} unless you change its filter. A ${format("Brawl", "brawl")} deck with a commander also gets links to combos with the commander and to combos in its colors.` },
          { p: `Commander Spellbook doesn't track every format. For ${format("Historic", "historic")}, ${format("Timeless", "timeless")}, and other formats it doesn't track, the links show combos legal in Commander.` },
        ],
      },
      {
        heading: "Bracket tags",
        blocks: [
          { p: `Commander Spellbook gives each combo a ${link("bracket tag", BRACKET_TAGS)}: the ${link("Commander brackets", BRACKETS)} it suits, from 1 (any deck) to 5 (${help("cEDH", "glossary")}). The tags are estimated from each combo's cards and results, as a guideline.` },
          {
            terms: [
              ["Ruthless", "Bracket 4 and up. Usually a fast two-card combo, or one with infinite turns, mass land denial, or control of opponents' turns."],
              ["Spicy", "Probably bracket 3 or 4, but hard to classify. It could be Ruthless, but it needs a third card, doesn't produce a relevant result, or stalls the game."],
              ["Powerful", "Bracket 3 and up. It uses a game changer, or it's a slow but relevant two-card combo."],
              ["Oddball", "Probably bracket 2 or 3, but hard to classify. It could be Powerful, but it needs a third card or doesn't produce a relevant result."],
              ["Core", "Bracket 2 and up. It uses an extra-turn card without taking extra turns, or it's a two-card combo too fast for bracket 1."],
              ["Exhibition", "Any deck. Combos that don't fit the other tags."],
              ["Not legal", `It uses a card that's ${link("banned in Commander", BANNED)}.`],
            ],
          },
        ],
      },
      {
        heading: "Combo terms",
        blocks: [
          {
            terms: [
              [wiki("Loop"), "A set of actions that ends where it started, so you can do it again."],
              ["Infinite", "A loop you can repeat as many times as you like, such as untapping a creature for mana again and again. When you do it, you say how many times."],
              ["Two-card combo", "A combo that needs only two specific cards."],
              ["Prerequisites", "What must be true before you start, such as a creature on the battlefield or mana to spend."],
              ["Sac outlet", `A card that lets you ${wiki("sacrifice", "Sacrifice")} permanents whenever you like, usually for free.`],
              ["ETB", `Short for "${wiki("enters the battlefield", "Enters the battlefield")}". An ETB effect happens when a permanent enters.`],
              ["Variant", "The same combo with a different card that does the same job."],
              ["Salt", `How unfun a combo is to play against, rated 0 to 4 in ${link("salt votes", SALT)} by Commander Spellbook's users.`],
              ["Game changer", `A card on the ${link("Commander Game Changers list", GAME_CHANGERS)}. Decks with game changers belong in bracket 3 or higher.`],
            ],
          },
        ],
      },
      {
        heading: "Credit",
        blocks: [
          { p: `Combo searches and Find My Combos are by ${link("Commander Spellbook", SPELLBOOK_SITE)}. Cascade isn't made by or endorsed by Commander Spellbook.` },
        ],
      },
    ],
  },
  {
    id: "lists-and-decks",
    title: "Lists and decks",
    summary: "Save cards, check decks, and export them to MTG Arena.",
    sections: [
      {
        heading: "Save cards to a list",
        blocks: [
          {
            steps: [
              "On a card, select **Add**.",
              "Choose one or more lists, or enter a name to make a new one.",
              "Set the quantity and the section: **Main deck**, **Sideboard**, **Maybe**, or **Commander**.",
              "Select **Add**.",
            ],
          },
          { p: "**Maybe** holds cards you're considering. The Arena export leaves it out." },
          { p: "A list is a **Collection** or a **Deck**. A deck has a format: **Standard**, **Standard Brawl**, or **Brawl**. You can change the kind and the format at any time, and the cards stay." },
          { p: "If you remove a card from a list, select **Undo** to put it back." },
        ],
      },
      {
        heading: "Check a deck",
        blocks: [
          {
            terms: [
              [format("Standard", "standard"), `At least 60 cards in the main deck, at most 15 in the ${wiki("sideboard", "Sideboard")}, at most 4 copies of a card except ${wiki("basic lands", "Basic land")}, and only legal cards.`],
              [`${format("Brawl", "brawl")} and Standard Brawl`, `A commander, 100 cards for Brawl or 60 for Standard Brawl, one copy of each card except basic lands, cards in the commander's ${wiki("color identity", "Color identity")}, and only legal cards.`],
            ],
          },
          { p: "Legality comes from the card data saved with the list. To get current data, select **More**, then **Refresh card data**." },
          { p: `**Deck stats** shows the ${wiki("mana curve", "Mana curve")}, the colored mana symbols, and the card types.` },
        ],
      },
      {
        heading: "Export a deck to MTG Arena",
        blocks: [
          {
            steps: [
              "Open the deck in **Lists**.",
              "Select **Export for Arena**, then select **Copy**.",
              `In ${link("MTG Arena", ARENA)}, open **Decks**, then select **Import**.`,
            ],
          },
          { p: `To find combos in a list, select **Find combos**. The ${help("Combos", "combos")} help page explains how.` },
          { p: `To see a whole list on the ${link("Scryfall", SCRYFALL_SITE)} website, select **Open on Scryfall**. A long list opens in two or more parts, because Scryfall searches have a length limit.` },
        ],
      },
    ],
  },
  {
    id: "nerd-mode",
    title: "Nerd mode",
    summary: "More details on every card.",
    sections: [
      {
        blocks: [
          { p: NERD_MODE_TIP },
          { p: "Turn it on or off with **Nerd mode** at the top of the page. The app remembers your choice." },
          { p: `EDHREC rank is how popular a card is in Commander decks on ${link("EDHREC", EDHREC)}. Rank 1 is in the most decks. For the other terms, see the ${help("Glossary", "glossary")}.` },
        ],
      },
    ],
  },
  {
    id: "your-data",
    title: "Your data",
    summary: "Where your lists are stored, and how to back them up.",
    sections: [
      {
        heading: "Where your data is",
        blocks: [
          { p: `Your lists, presets, draw history, and settings are stored only in this browser, on this device, in its ${link("IndexedDB", INDEXEDDB)} storage. They don't sync between devices or browsers. If you clear the browser's site data for the app, they're deleted.` },
          { p: `A browser can also clear the data to free up space, unless the app's storage is persistent. **Data** shows which kind it has. For details, see ${link("how browsers limit storage", STORAGE_LIMITS)}.` },
          { p: `The app sends ${link("Scryfall", SCRYFALL_SITE)} your card searches, and the Scryfall IDs of cards when you refresh a list or show rulings. It doesn't send list names, notes, or anything else about you. The app sends ${link("Commander Spellbook", SPELLBOOK_SITE)} nothing: its links put a card name or colors in the address, and you paste a list there yourself.` },
        ],
      },
      {
        heading: "Back up and restore",
        blocks: [
          {
            steps: [
              "Open **Data**.",
              "Select **Export backup**. Keep the file somewhere safe.",
              "To restore it, or to move your data to another device, choose the file under **Import backup**, then select **Import**.",
            ],
          },
          { p: `The app reminds you to back up when your lists changed and your last backup is more than ${BACKUP_REMINDER_DAYS} days old.` },
        ],
      },
      {
        heading: "iPhone and iPad",
        blocks: [
          { p: `Safari ${link("deletes a site's data", SAFARI_7_DAYS)} after 7 days of Safari use without a visit. To keep your lists, add the app to your Home Screen: in Safari, select **Share**, then ${link("Add to Home Screen", HOME_SCREEN)}. Then open the app from its icon.` },
        ],
      },
      {
        heading: "Credits",
        blocks: [
          { p: `Card data and images are from ${link("Scryfall", SCRYFALL_SITE)}. ${APP_NAME} isn't made by or endorsed by Scryfall.` },
          { p: `${APP_NAME} is unofficial fan content, under the Wizards of the Coast ${link("Fan Content Policy", FAN_CONTENT_POLICY)}.` },
        ],
      },
    ],
  },
  {
    id: "glossary",
    title: "Glossary",
    summary: "The Magic terms the app uses, with links to learn more.",
    sections: [
      {
        heading: "Cards",
        blocks: [
          {
            terms: [
              [wiki("Rules text", "Oracle"), "A card's current official wording, also called Oracle text. It can differ from the text printed on older cards."],
              [wiki("Type line"), "The line under the art that gives the card's types, such as \"Legendary Creature — Elf Druid\"."],
              [wiki("Keyword ability"), "A word that stands for a longer rule, such as flying or trample. **Details** explains the keywords on each card."],
              [wiki("Ability word"), "A word in italics, such as landfall, that names a kind of ability. It has no rules meaning of its own."],
              [wiki("Legendary"), "You can control only one legendary permanent with the same name. A commander is usually a legendary creature."],
              [wiki("Double-faced card"), "A card with a face on each side. Select **Show other face** to see the back."],
              [wiki("Token"), "A permanent that an effect creates, which isn't a card. **Related cards and tokens**, in the details, lists the ones a card makes."],
              [wiki("Rarity"), "How rare a card is in packs: common, uncommon, rare, or mythic rare."],
              [wiki("Rebalanced card"), "A digital-only version of a card that MTG Arena changed for balance. Its name starts with A-. **Exclude rebalanced cards** leaves these out of searches."],
              [link("EDHREC rank", EDHREC), "How popular a card is in Commander decks on EDHREC. Rank 1 is in the most decks."],
            ],
          },
        ],
      },
      {
        heading: "Colors and costs",
        blocks: [
          {
            terms: [
              [wiki("Mana cost"), "The mana symbols at the top right of a card. You pay them to cast it."],
              [wiki("Mana value"), "The total amount of mana in a card's mana cost. For example, a card that costs {2}{G}{G} has a mana value of 4. It used to be called converted mana cost."],
              [wiki("Color identity"), "A card's colors, plus the colors of every mana symbol in its cost and rules text. In Commander and Brawl, every card in a deck must fit the commander's color identity."],
              [wiki("Colorless"), "Having no color. Most artifacts and lands are colorless."],
              [wiki("Mana curve"), "How many cards a deck has at each mana value. **Deck stats** shows it as a chart."],
            ],
          },
        ],
      },
      {
        heading: "Formats and games",
        blocks: [
          {
            terms: [
              [wiki("Format"), "A set of rules for which cards a deck can use and how it's built."],
              [format("Standard", "standard"), "A format with cards from recent sets. Older sets leave Standard as new ones come out."],
              [format("Brawl", "brawl"), "On MTG Arena, a format with a 100-card deck: a commander and 99 other cards, with one copy of each card except basic lands."],
              [wiki("Standard Brawl", "Brawl"), "Brawl with a 60-card deck and only cards that are legal in Standard."],
              [format("Commander", "commander"), "A multiplayer format with a 100-card deck led by a legendary creature, with one copy of each card except basic lands."],
              [format("Historic", "historic"), "An MTG Arena format with cards from every set on Arena, and its own banned list."],
              [format("Timeless", "timeless"), "An MTG Arena format with nearly every card on Arena and very few bans."],
              [format("Alchemy", "alchemy"), "An MTG Arena format built on Standard, with digital-only cards and rebalanced cards."],
              [format("Pioneer", "pioneer"), "A format with cards from Return to Ravnica (2012) on. Sets don't leave it."],
              [link("MTG Arena", ARENA), "The digital version of Magic: The Gathering for computers and phones."],
              [link("Magic Online", MTGO), "Another digital version of the game, also called MTGO. Its prices are in event tickets (tix)."],
            ],
          },
        ],
      },
      {
        heading: "Decks",
        blocks: [
          {
            terms: [
              [wiki("Sideboard"), "Up to 15 extra cards for a Standard deck, which you can swap in between games of a match."],
              [wiki("Basic land"), "Plains, Island, Swamp, Mountain, Forest, and Wastes. A deck can have any number of them."],
              [wiki("Singleton"), "A deck with only one copy of each card, except basic lands. Brawl and Commander decks are singleton."],
              [wiki("Synergy"), "Cards that are stronger together than apart. **Explore** finds cards with synergy."],
              [wiki("Removal"), "A card that destroys, exiles, or otherwise gets rid of an opponent's permanent. The **Counters** tab in Explore finds removal and other answers."],
              [wiki("Landfall"), "An ability word for abilities that trigger when a land enters the battlefield under your control."],
            ],
          },
        ],
      },
      {
        heading: "Commander",
        blocks: [
          {
            terms: [
              [link("Commander brackets", BRACKETS), "Five levels, from 1 (Exhibition) to 5 (cEDH), that describe how strong a Commander deck is, so players can find games that suit them."],
              [link("Game changer", GAME_CHANGERS), "A card on the Commander Game Changers list. Brackets 1 and 2 allow none, bracket 3 allows up to three, and brackets 4 and 5 allow any number."],
              [wiki("cEDH", "CEDH"), "Competitive Commander: decks built to win as fast and as reliably as possible. It's bracket 5."],
            ],
          },
          { p: `For combo terms, such as loop, infinite, and salt, see ${help("Combos", "combos")}.` },
        ],
      },
    ],
  },
];

/**
 * The page with this ID, or the first page.
 * @param {string|null|undefined} id
 */
export function docPage(id) {
  return DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
/** Link targets the Help view opens: https:// addresses and help pages. */
const SAFE_HREF = /^(?:https:\/\/[^\s"<>]+|#help\/[a-z][a-z-]*)$/;

/**
 * Splits text into parts at **double asterisks** (bold) and [label](url)
 * (links). A link to anything but an https:// address or a help page stays
 * plain text, as written.
 * @param {string} text
 * @returns {{text: string, strong: boolean, href?: string}[]}
 */
export function inlineParts(text) {
  const parts = [];
  let strong = false;
  const plainParts = (chunk) => {
    chunk.split("**").forEach((t, i) => {
      if (i > 0) strong = !strong;
      if (t !== "") parts.push({ text: t, strong });
    });
  };
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    plainParts(text.slice(last, m.index));
    if (SAFE_HREF.test(m[2])) parts.push({ text: m[1], strong, href: m[2] });
    else parts.push({ text: m[0], strong });
    last = m.index + m[0].length;
  }
  plainParts(text.slice(last));
  // Join neighbors that are both plain and look the same.
  return parts.reduce((out, p) => {
    const prev = out[out.length - 1];
    if (prev && !prev.href && !p.href && prev.strong === p.strong) prev.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

const plain = (text) => inlineParts(text).map((p) => p.text).join("");

/** Every text in a page, in order, with its marks. */
function pageStrings(page) {
  const out = [page.title, page.summary];
  for (const s of page.sections) {
    if (s.heading) out.push(s.heading);
    for (const b of s.blocks) {
      if ("p" in b) out.push(b.p);
      if ("steps" in b) out.push(...b.steps);
      if ("list" in b) out.push(...b.list);
      if ("terms" in b) for (const [t, d] of b.terms) out.push(t, d);
    }
  }
  return out;
}

/**
 * All the text of a page, without marks. Tests use it to keep the pages
 * in step with the app.
 * @param {DocPage} page
 */
export function pageText(page) {
  const lines = [page.title, page.summary];
  for (const s of page.sections) {
    if (s.heading) lines.push(s.heading);
    for (const b of s.blocks) {
      if ("p" in b) lines.push(plain(b.p));
      if ("steps" in b) lines.push(...b.steps.map(plain));
      if ("list" in b) lines.push(...b.list.map(plain));
      if ("terms" in b) lines.push(...b.terms.map(([t, d]) => `${plain(t)}: ${plain(d)}`));
    }
  }
  return lines.join("\n");
}

/**
 * The links in a page, in order.
 * @param {DocPage} page
 * @returns {{text: string, href: string}[]}
 */
export function pageLinks(page) {
  return pageStrings(page).flatMap((t) => inlineParts(t).filter((p) => p.href).map((p) => ({ text: p.text, href: p.href })));
}
