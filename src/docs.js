// The help pages built into the app, shown in the Help view, and the text
// of every tooltip. Pure module: plain data and text helpers, no DOM. When
// the app changes, check these too (AGENTS.md, "Keep the docs in step").
//
// Text can mark a UI label in bold with **double asterisks**, and a link
// with [label](url). A link goes to an https:// address, which opens in a
// new tab, or to a help page, such as #help/combos. Nothing else is markup,
// and the Help view never parses HTML.

import {
  APP_NAME, BACKUP_REMINDER_DAYS, DELETION_KEEP_DAYS, HAND_SIZE, HISTORY_LIMIT, MAX_DRAW, MIN_DRAW, SCRYFALL_SITE, SMALL_POOL_SIZE,
  GITHUB_BACKUP_DIR, SPELLBOOK_SITE, SYNC_FILE_NAME,
} from "./config.js";
import { FIND_MY_COMBOS_URL } from "./combos.js";
import { scryfallListUrls } from "./links.js";
import { CARD_KINGDOM_BUILDER, TCGPLAYER_MASS_ENTRY } from "./buy.js";

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
  clearFilters: "Removes every filter, including Scryfall search, so any card matches. Undo clear all puts them back.",
  drawMode: "Shows random cards that match your filters. A new draw prefers cards you haven't drawn recently.",
  browseMode: "Lists every card that matches your filters, in the order you choose.",
  openSearch: "Opens this search on the Scryfall website, in a new tab.",
  game: "Shows only cards you can play in this game: MTG Arena, Magic Online (MTGO), or paper.",
  rebalanced: "Leaves out rebalanced cards: digital-only versions that MTG Arena changed for balance. Their names start with A-.",
  colorMode: "How the colors you choose filter cards. Exactly: only those colors. At least: those colors and maybe more. At most: no other colors. Any: no color filter. Ticking a color with Any picks a mode for you.",
  colorIdentity: "Matches the colors in a card's rules text as well as its cost, the way Commander and Brawl decks are built. Commander and Brawl formats tick it for you.",
  typeLine: "Matches words in the type line, such as Elf, Equipment, or Legendary.",
  manaValue: "The total amount of mana in a card's cost. For example, a card that costs {2}{G}{G} has a mana value of 4.",
  keyword: "Matches a keyword ability, such as flying, trample, or ward.",
  rulesText: "Matches words in the card's rules text, such as \"draw a card\".",
  roles: "Finds cards that do any of the jobs you tick, such as creature removal or ramp. It uses Scryfall Tagger tags, which the community maintains.",
  abilityCount: "Counts the lines of rules text. Keywords on one line, such as flying and trample, count as one ability. Keywords only means the card has keywords and nothing else.",
  commander: "Finds cards that can lead a Commander or Brawl deck, such as legendary creatures. In Brawl formats, it includes legendary planeswalkers too.",
  creatureAbilities: "Finds cards with every keyword you tick. For example, Flying and Lifelink finds cards with both.",
  firstPrinted: "The year the card was first printed, in any set. A reprint of an old card counts as old.",
  set: "Finds cards printed in any of the sets you tick. Type part of a set name, or its code, such as DSK.",
  price: "The highest paper price, in dollars (USD), from Scryfall. Arena and MTGO cards have no paper price, so this works only when Game is Paper or Any.",
  popularity: "How often Commander decks on EDHREC play the card. Staples are in the most decks. Spicy cards are rarely played, with a rank over 10,000.",
  exportArena: "Shows the deck as text to copy and import into MTG Arena.",
  importDeck: "Makes a deck from pasted deck text, such as the text from the Export button in MTG Arena or from a deck site.",
  findCombos: "Shows the list as text to paste into Find My Combos on Commander Spellbook.",
  editInDiscover: "Opens Discover in deck mode with this deck, so you can add and remove copies from each card.",
  deckMode: "Choose a deck to work on. Each card then shows its count in the deck, with − and + to remove or add a copy.",
  deckAddsTo: "The deck section that + adds to and − removes from. The count on each card is for this section.",
  deckStop: "Ends deck mode. The deck and your filters stay as they are.",
  openList: "Opens every card in this list on the Scryfall website, in a new tab.",
  sampleHand: "Draws a random opening hand from the main deck, so you can try mulligans and see the odds of a good start.",
  buyList: "Shows the cards to buy, with an estimated total, and opens them in TCGplayer or Card Kingdom with the list filled in.",
  duplicateList: "Makes a new list with the same cards, kind, and format. Changes to the copy don't change this list.",
  refresh: "Gets current legality, prices, and images from Scryfall. Quantities, sections, and notes stay the same.",
  listKind: "A deck gets deck checks and stats for its format. A collection is a plain list of cards.",
  section: "Maybe holds cards you're considering, and the Arena export leaves it out. Commander holds a Brawl deck's commander.",
  edhrecRank: "How popular the card is in Commander decks on EDHREC. Rank 1 is in the most decks.",
  storage: "Persistent storage means the browser keeps the app's data even when the device runs low on space. Otherwise, the browser can clear it to free up space.",
  syncToken: "A fine-grained token from GitHub that can read and write only your sync repository. The app keeps it in this browser only, and never puts it in a backup.",
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
const TCGPLAYER = "https://www.tcgplayer.com";
const HYPERGEOMETRIC = "https://en.wikipedia.org/wiki/Hypergeometric_distribution";
const MTGGOLDFISH = "https://www.mtggoldfish.com";
const UNTAPPED = "https://mtga.untapped.gg";
const FAN_CONTENT_POLICY = "https://company.wizards.com/en/legal/fancontentpolicy";
const SAFARI_7_DAYS = "https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/";
const HOME_SCREEN = "https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios";
const STORAGE_LIMITS = "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria";
const INDEXEDDB = "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API";
const GITHUB = "https://github.com";
const GITHUB_NEW_REPO = "https://github.com/new";
const GITHUB_TOKENS = "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens";
const GITHUB_PRIVATE = "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility";

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
          { p: `${APP_NAME} helps you discover ${link("Magic: The Gathering", MTG)} cards, learn what they do, and see how they work together. On any card, **Explore** finds synergies, similar cards, counters, and combos. It runs in your browser and gets card data and images from ${link("Scryfall", SCRYFALL_SITE)}. It has no server and no accounts.` },
          { p: `It's made for ${link("MTG Arena", ARENA)}, the digital version of the game, and its ${format("Standard", "standard")} and ${format("Brawl", "brawl")} formats. You can still search every card.` },
        ],
      },
      {
        heading: "The views",
        blocks: [
          {
            terms: [
              ["Discover", "Draw random cards, or browse every card that matches your filters."],
              ["Lists", "Your collections and decks, with deck checks, stats, export for MTG Arena, and **Find combos**."],
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
              "Keep the **Arena Standard** preset, or choose another one and select **Apply**.",
              "Select **Draw**.",
              "On a card, select **Details** to read everything about it, or **Add** to save it to a list.",
            ],
          },
        ],
      },
      {
        heading: "Help in the app",
        blocks: [
          { p: "Many buttons show a tooltip that says what they do when you point at them or move the keyboard focus to them. To see what a filter or setting means, select **?** next to it. Press Escape to hide a tooltip." },
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
          { p: `The built-in **Newest Standard set** preset finds the cards in the newest set that is legal in Standard on MTG Arena. Its name shows the set. The app gets the set from ${link("Scryfall", SCRYFALL_SITE)} when it opens, so the preset shows up a moment after the page loads. A set counts from its release date, so a set that isn't out yet is never chosen. MTG Arena often gets a new set a few days before that date. If Scryfall can't be reached, the preset isn't listed until you come back to **Discover** with a connection.` },
          {
            steps: [
              "Choose a preset, then select **Apply**.",
              `To narrow the search, select **Filters**. You can filter by ${wiki("format", "Format")}, game, colors, ${wiki("card types", "Card type")}, ${wiki("type line", "Type line")} text, ${wiki("mana value", "Mana value")}, ${wiki("rarity", "Rarity")}, and Scryfall search syntax. More filters are in four groups that open and close: **Card**, **Creature**, **Printing**, and **Popularity**.`,
              "To keep your filters for later, select **Save as preset** and enter a name.",
            ],
          },
          { p: "Each active filter shows as a chip under the preset. To remove a filter, select **×** on its chip. To remove them all, select **Clear all filters**. Until you change a filter, **Undo clear all** puts them back. The app shows how many cards match." },
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
              ["Color mode", "**Exactly** finds cards with only the colors you choose. **At least** finds cards with those colors and maybe more. **At most** finds cards with no other colors. **Any** doesn't filter by color. When you tick a color with the mode on **Any**, the mode changes for you: **At most** with color identity, so green finds every card a green deck can play, and **At least** without it."],
              ["Use color identity", `Reads colors as ${wiki("color identity", "Color identity")}, which counts the mana symbols in a card's rules text too. Use it for ${format("Commander", "commander")} and Brawl decks. Choosing ${format("Commander", "commander")}, ${format("Brawl", "brawl")}, ${format("Oathbreaker", "oathbreaker")}, or another format built by color identity ticks it for you. Lands have no color, so without it a search for green lands finds almost no lands: mostly double-faced cards with a green spell on the front.`],
            ],
          },
          { p: `To look up other terms, see the ${help("Glossary", "glossary")}.` },
        ],
      },
      {
        heading: "More filters",
        blocks: [
          { p: "Select a group's name to open it. When filters in a group are on, its name says how many, for example **Card 2 on**. A preset with filters in a group opens that group when you apply it." },
          {
            terms: [
              ["What the card does", `In **Card**. Finds cards that do any of the jobs you tick: creature removal, ramp, card draw, counterspell, board wipe, burn, tutor, or combat trick. It uses ${link("Scryfall Tagger", TAGGER)} tags, which the community maintains, so check the results.`],
              ["Number of abilities", `In **Card**. Counts the lines of rules text, so flying and trample on one line count as one ability, and so does a line with one keyword. ${card("Serra Angel")} has flying and vigilance on two lines, so it has two. **1** also finds cards with one line of keywords. **None** finds ${wiki("vanilla", "Vanilla")} cards, with no rules text. **Keywords only** finds ${wiki("French vanilla", "French vanilla")} cards, with keywords and nothing else.`],
              ["Keyword ability and Rules text", "In **Card**. Type a keyword, or words from the rules text."],
              ["Can be your commander", `In **Card**. Finds cards that can lead a ${format("Commander", "commander")} or Brawl deck, such as legendary creatures. When the format is Brawl or Standard Brawl, it includes legendary planeswalkers too, as Brawl allows.`],
              ["Creature abilities", `In **Creature**. Finds cards with every ${wiki("keyword", "Keyword ability")} you tick. For example, **Flying** and **Lifelink** finds cards with both. For a keyword that isn't in the list, type it in **Keyword ability**.`],
              ["Power and Toughness", `In **Creature**. A minimum and a maximum, like **Mana value**. Cards with * in their ${wiki("power", "Power")} or ${wiki("toughness", "Toughness")}, such as ${card("Tarmogoyf")}, match only where Scryfall can compare them.`],
              ["First printed", `In **Printing**. The years that the card was first printed in, from and to. A ${wiki("reprint", "Reprint")} of an old card counts as old. With a year set, **Game** looks at every printing of the card, not one printing. But **Set**, **Rarity**, and **Paper price** look at the first printing only, and a note under **First printed** says so. For example, a year and a set together find cards first printed in that set.`],
              ["Set", `In **Printing**. Type part of a set name, or its code, such as DSK, then tick one or more sets. The list of sets comes from ${link("Scryfall", SCRYFALL_SITE)} when the page opens, or when you first open **Printing**. Ticked sets stay at the top of the list.`],
              ["Paper price at most (USD)", "In **Printing**. The highest paper price, in dollars, from Scryfall. The price isn't used when **Game** is **Arena** or **MTGO**, and its chip says so. Set **Game** to **Paper** or **Any** to use it."],
              ["Popularity", `In **Popularity**. How often Commander decks on ${link("EDHREC", EDHREC)} play the card. **Staples** are in the top 1,000, and **Popular** cards in the top 5,000. **Spicy** cards are rarely played: their rank is over 10,000. The rank counts Commander decks only, so it is a rough guide for Standard.`],
            ],
          },
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
              `The printing, prices, and links to buy the card on ${link("TCGplayer", TCGPLAYER)}, ${link("Cardmarket", "https://www.cardmarket.com")}, or ${link("Cardhoarder", "https://www.cardhoarder.com")}.`,
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
              ["Combos", `Links to combos with this card on Commander Spellbook, in the format of your current search, or Commander when the search has no format. A ${wiki("legendary", "Legendary")} creature or planeswalker also gets a link to combos in its colors, for a deck it leads. See the ${help("Combos", "combos")} help page.`],
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
          { p: `A combo is a set of cards that work together to do something big, such as making infinite mana or winning the game. ${APP_NAME} finds combos with ${link("Commander Spellbook", SPELLBOOK_SITE)} (commanderspellbook.com), a free combo database. It's a separate site: ${APP_NAME} links to it and shows none of its data.` },
        ],
      },
      {
        heading: "Find combos",
        blocks: [
          {
            terms: [
              ["Combos tab", "In **Explore**, the **Combos** tab links to combos with the card, legal in the format of your current search, or in Commander when the search has no format."],
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
          { p: `Combo searches and Find My Combos are by ${link("Commander Spellbook", SPELLBOOK_SITE)} (commanderspellbook.com). ${APP_NAME} isn't made by or endorsed by Commander Spellbook.` },
        ],
      },
    ],
  },
  {
    id: "lists-and-decks",
    title: "Lists and decks",
    summary: "Save cards, check decks, draw sample hands, import and export decks for MTG Arena, and buy cards.",
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
          { p: "To try a different build without losing the one that works, select **More**, then **Duplicate**. The copy has the same cards, kind, and format, and its name ends in (copy). Changes to the copy don't change the first list. It uses the card data saved with the list, so it sends no requests to Scryfall. With GitHub sync on, the copy syncs as a new list." },
        ],
      },
      {
        heading: "Work on a deck in Discover",
        blocks: [
          { p: "Deck mode keeps one deck in view while you look for cards. Each card shows how many copies are in the deck, with **−** and **+** to remove or add one copy." },
          {
            steps: [
              "In Discover, choose a deck in the **Deck** menu. Or open a deck in **Lists** and select **Edit in Discover**.",
              "Find cards with **Draw random** or **Browse all**. Under each card's type line, select **+** to add a copy or **−** to remove one.",
              "To end deck mode, select **Stop**. The deck and your filters stay as they are.",
            ],
          },
          { p: "When deck mode starts, the filters change to the deck's format and colors, one time: the commander's color identity for a Brawl deck, or the colors of the cards in a Standard deck. Each one shows as a filter chip, and you can remove it." },
          { p: "The deck bar above the cards shows the deck's name, its card count (for example \"58 of 60\"), and how many problems the deck checks find. **Open deck** opens it in **Lists**." },
          { p: "**Adds to** sets the section that **+** adds to and **−** removes from: **Main deck**, **Sideboard**, or **Maybe** for Standard, and **Main deck**, **Commander**, or **Maybe** for Brawl. The count on each card is for that section, and the card says when it's in another section too." },
          { p: "**+** stops at the copy limit: 4 copies in Standard, counting the sideboard, and 1 in Brawl, counting the commander. Basic lands, cards whose text allows more copies, and **Maybe** have no such limit. To go past the limit on purpose, change the quantity in **Lists**." },
          { p: "If **−** removes the last copy, select **Undo** on the card to put it back." },
          { p: "**Hide cards in the deck** leaves out cards that are already in the main deck, the commander section, or the sideboard. Cards in **Maybe** still show. A note says how many are hidden. A card you add stays in view until the next draw or search." },
          { p: "The details of a card show the same count, **−**, and **+**. The **Add** button still adds a card to any list." },
          { p: "The chosen deck is kept on this device only. It doesn't sync and isn't in backups. It stays after you reload the page, and deck mode stops if the deck is deleted or becomes a collection." },
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
        heading: "Draw a sample hand",
        blocks: [
          { p: "A sample hand shows how a deck might start a game. Nothing is saved, and the deck doesn't change." },
          {
            steps: [
              "Open the deck in **Lists**, then select **Sample hand**.",
              `The app shuffles the main deck and draws ${HAND_SIZE} cards. The commander, the sideboard, and **Maybe** stay out.`,
              "To draw for the next turns, select **Draw a card**. Each card comes from the top of the library.",
              "To start again from a new shuffle, select **New hand**.",
            ],
          },
          { p: `**Mulligan** follows the ${wiki("London mulligan", "Mulligan")}, from ${link("rule 103.5", RULES)} of the Comprehensive Rules. The app shuffles your hand back and draws ${HAND_SIZE} new cards. Then you put one card on the bottom of the library for each mulligan so far: select **Put on bottom** under each card to put back. **Draw a card** waits until you're done. You can't take a mulligan after you draw a card.` },
          { p: `In ${format("Brawl", "brawl")} and Standard Brawl, the first mulligan is free: you put no card on the bottom for it. Rule 103.5c says so for every Brawl game.` },
          { p: `**Odds of a good start** gives three chances for a ${HAND_SIZE}-card hand with no mulligan: 2 to 4 lands in the opening hand, a land to play on each of your first four turns, and a card with mana value 2 by turn 2. They come from the ${link("hypergeometric distribution", HYPERGEOMETRIC)}, the math of drawing cards without putting them back. On the play, you take the first turn and skip its draw. On the draw, you see one more card by each turn.` },
          { p: "Lands count by the front face, as in **Deck stats**. A modal double-faced card with a spell on the front counts as a spell, even though you can play its back as a land." },
          { p: `In best-of-one games, ${link("MTG Arena", ARENA)} uses its own way to pick an opening hand. Wizards of the Coast hasn't published how it works, so **Sample hand** doesn't copy it. Its hands and odds come from a plain shuffle, as in best-of-three games and paper Magic.` },
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
      {
        heading: "Import a deck",
        blocks: [
          {
            steps: [
              `Copy the deck text. In ${link("MTG Arena", ARENA)}, open the deck, then select **Export**. On a deck site such as ${link("MTGGoldfish", MTGGOLDFISH)} or ${link("Untapped.gg", UNTAPPED)}, use its copy or export for Arena.`,
              "In **Lists**, select **Import deck**, then paste the text into **Deck text**.",
              "Under **Import into**, choose **A new list** or a list you already have. Then choose the **Format**.",
              "Select **Look up cards**.",
              "If some lines didn't match, fix each one and select **Look up again**, or select **Skip**.",
              "Select **Save list**.",
            ],
          },
          { p: `A line is the number of copies, then the card name, such as 4 ${card("Llanowar Elves")}. It can also have the set code and collector number, such as 4 Llanowar Elves (FDN) 227, and then that printing is saved. 4x, set codes in small letters, and foil marks such as *F* work too.` },
          { p: "The **Commander**, **Deck**, **Sideboard**, and **Companion** headers put cards in those sections, and a header can have a count, such as Deck (60). A companion goes in the sideboard. When the text has no **Sideboard** header, the cards after a blank line go in the sideboard. A **Name** line under **About** names the new list." },
          { p: `The app looks up the cards on ${link("Scryfall", SCRYFALL_SITE)}. Each card is saved with its current card data. Cards already in a list don't change. Text from **Export for Arena** imports back to the same cards.` },
        ],
      },
      {
        heading: "Buy cards",
        blocks: [
          { p: `To buy one card in paper, select **Buy** on the card in **Discover**. The card opens on ${link("TCGplayer", TCGPLAYER)} in a new tab. In nerd mode, **Buy** shows the card's price. Some paper cards show a printing that is only on MTG Arena. For those, **Buy** searches TCGplayer for the card by name, with no price. A card made only for MTG Arena has no **Buy** link.` },
          { p: "To buy many cards, add them to a list first." },
          {
            steps: [
              "Open the list in **Lists**, then select **Buy cards**.",
              "Under **Cards to include**, tick the sections to buy. **Commander**, **Main deck**, and **Sideboard** start ticked. **Maybe** and **Basic lands** start unticked, because most players already own basic lands.",
              `Select **Open on TCGplayer** or **Open on Card Kingdom**. ${link("TCGplayer Mass Entry", TCGPLAYER_MASS_ENTRY)} or the ${link("Card Kingdom Deck Builder", CARD_KINGDOM_BUILDER)} opens in a new tab, with the list filled in.`,
              "On the store's page, choose the printing and condition, then add the cards to your cart.",
            ],
          },
          { p: "The panel shows an estimated total from the prices saved with the list. Prices come from Scryfall, which gets them from TCGplayer. They change daily, so the store's total can be different. To get current prices, select **More**, then **Refresh card data**." },
          { p: "The panel says which cards it leaves out: cards made only for digital play, and basic lands when **Basic lands** is unticked. A card with no saved price is still in the list, but not in the total. The total uses non-foil prices only." },
          { p: "A very long list opens in two or more parts, because a link has a length limit. For any other store, select **Copy** and paste the list into the store's bulk entry or deck builder." },
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
          { p: `Your lists, presets, draw history, and settings are stored in this browser, on this device, in its ${link("IndexedDB", INDEXEDDB)} storage. They don't sync between devices or browsers unless you ${help("sync with GitHub", "sync")}. If you clear the browser's site data for the app, they're deleted from this browser.` },
          { p: `A browser can also clear the data to free up space, unless the app's storage is persistent. **Data** shows which kind it has. For details, see ${link("how browsers limit storage", STORAGE_LIMITS)}.` },
          { p: `The app sends ${link("Scryfall", SCRYFALL_SITE)} your card searches, the Scryfall IDs of cards when you refresh a list or show rulings, and the card names, set codes, and collector numbers of a deck you import. It doesn't send list names, notes, or anything else about you. If you connect GitHub, sync sends your lists, custom presets, and synced settings to your own private repository on ${link("GitHub", GITHUB)}. When you select **Export to GitHub**, the app also sends a full backup there, with your history and every setting. The app sends GitHub nothing else. The app sends ${link("Commander Spellbook", SPELLBOOK_SITE)} nothing: its links put a card name or colors in the address, and you paste a list there yourself.` },
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
          { p: `The app reminds you to back up after your lists or presets change, if you've never backed up or your last backup is more than ${BACKUP_REMINDER_DAYS} days old.` },
          { p: "When sync with GitHub is on, you can also keep backups in the sync repository. See **Backups on GitHub** on the **Sync with GitHub** page." },
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
    id: "sync",
    title: "Sync with GitHub",
    summary: "Keep your lists on every device, in a private GitHub repository.",
    sections: [
      {
        heading: "What syncs",
        blocks: [
          { p: `Sync keeps your lists, custom presets, and some settings in one file in a private repository on ${link("GitHub", GITHUB)}. Each device that you connect reads the file, merges it with its own data, then saves the result to the file. The synced settings are nerd mode, **Draw** or **Browse**, and the **Browse** sort order.` },
          { p: "Your draw history, your last search, and the date of your last backup stay on each device." },
          { p: `Each list and preset syncs as a whole. When the same list changed on two devices between syncs, the copy that changed last wins, and the other device's changes to that list are lost. To avoid this, let a device sync before you edit the same list on another one. A list or preset that you delete is deleted on every device. After ${DELETION_KEEP_DAYS} days, the app forgets the delete, so a device that doesn't sync for longer than that can bring the deleted item back.` },
        ],
      },
      {
        heading: "Connect",
        blocks: [
          {
            steps: [
              `On GitHub, ${link("create a repository", GITHUB_NEW_REPO)}. Make it **Private**. The app doesn't connect to a ${link("public repository", GITHUB_PRIVATE)}, because anyone can read one.`,
              "In the app, open **Data**. Under **Sync with GitHub**, enter the repository as account/name, for example your-name/cascade-data.",
              "Select **Create a token**. GitHub opens with the token's name, your account, and the **Contents** permission filled in. Under **Repository access**, select **Only select repositories**, choose your repository, then select **Generate token**.",
              "Copy the token. Paste it into **Token**, then select **Connect**.",
              "On each of your other devices, connect to the same repository. You can use the same token, or make a token for each device.",
            ],
          },
        ],
      },
      {
        heading: "When it syncs",
        blocks: [
          { p: "The app syncs when it opens, when you come back to it after a minute or more, a few seconds after you change a list, a preset, or a synced setting, and when you select **Sync now**. **Data** shows when the last sync was, or what went wrong." },
          { p: "If a sync fails, your changes stay on this device, and the next sync sends them. If sync stops because of the token or the repository, the app shows a message once." },
          { p: "When you replace all of your data with a backup under **Import backup**, your synced devices get the same data at their next sync." },
        ],
      },
      {
        heading: "Your token",
        blocks: [
          { p: `The token is a ${link("fine-grained personal access token", GITHUB_TOKENS)}. It can read and write only the repository that you choose. The app keeps it in this browser only. It never goes into a backup or the sync file, and the app sends it only to GitHub.` },
          { p: `To remove the token from this browser, select **Disconnect**. Your data stays on the device and in the repository. To stop the token working on every device, ${link("delete it on GitHub", GITHUB_TOKENS)}.` },
          { p: "The token page sets the token to expire after 366 days. When the token expires, **Data** says that GitHub refused it. Select **Disconnect**, then connect again with a new token." },
        ],
      },
      {
        heading: "The sync file",
        blocks: [
          { p: `The file is ${SYNC_FILE_NAME}, at the top of the repository. It has the same format as a backup, without the history, so you can also import it under **Import backup**. GitHub keeps every earlier copy of the file in the repository's history.` },
        ],
      },
      {
        heading: "Backups on GitHub",
        blocks: [
          { p: `While the app is connected, **Data** can also save full backups in the repository. A backup on GitHub is the same as a file from **Export backup**: it has all of your lists, custom presets, history, and settings, and never the token.` },
          {
            steps: [
              "Open **Data**.",
              `Under **Backup**, select **Export to GitHub**. The app adds a new file to the ${GITHUB_BACKUP_DIR} folder of the repository, with the date and time in its name. Earlier backups stay.`,
              "To restore one, under **Import backup**, select **Choose a backup on GitHub**. Choose a backup from the list, newest first, then select **Open backup**.",
              "Choose **Merge** or **Replace**, select **Import**, then confirm.",
            ],
          },
          { p: `Sync doesn't read or change the ${GITHUB_BACKUP_DIR} folder. Each export is a new commit in the repository. To delete old backups, delete their files on GitHub.` },
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
              [wiki("Rarity"), "How rare a card is in packs: common, uncommon, rare, or mythic rare. A few cards are special or bonus."],
              [wiki("Rebalanced card"), "A digital-only version of a card that MTG Arena changed for balance. Its name starts with A-. **Exclude rebalanced cards** leaves these out of searches."],
              [link("EDHREC rank", EDHREC), "How popular a card is in Commander decks on EDHREC. Rank 1 is in the most decks."],
              [link("Staple", EDHREC), "A card that many decks play. **Popularity** finds staples by EDHREC rank."],
              [link("Spicy", EDHREC), "A card that is rarely played, often a surprise to the other players. **Popularity** finds spicy cards by EDHREC rank. In combos, Spicy is also a bracket tag."],
              [wiki("Vanilla"), `A creature with no rules text at all, such as ${card("Grizzly Bears")}.`],
              [wiki("French vanilla"), "A creature with only keyword abilities, such as flying or trample, and no other rules text."],
              [wiki("Reprint"), "A new printing of a card that was printed before. **First printed** counts the first printing only."],
              [wiki("Power"), "The first number at the bottom right of a creature: the damage it deals in combat. Toughness, the second number, is the damage it takes to destroy it."],
              [wiki("Set"), "A group of cards released together, such as Duskmourn: House of Horror. Each set has a short code of letters and numbers, such as DSK or M21."],
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
              [wiki("Mulligan"), `Shuffling your opening hand back and drawing a new one. With the London mulligan, you draw ${HAND_SIZE} cards each time, then put one card on the bottom of your library for each mulligan. **Sample hand** has **Mulligan**.`],
              [wiki("Library"), "Your deck during a game: the cards you draw from, face down. **Sample hand** draws from the top of it."],
              [link("On the play", RULES), "Taking the first turn of a game. In a two-player game, the player on the play skips the draw on their first turn. The other player is on the draw."],
              [wiki("Sideboard"), "Up to 15 extra cards for a Standard deck, which you can swap in between games of a match."],
              [wiki("Companion"), "A creature with a deckbuilding condition that starts the game outside the deck, in the sideboard. **Import deck** puts a companion in the sideboard."],
              [wiki("Collector number"), "The number printed on a card, which tells it apart from other cards in its set. With the set code, it names one printing, such as FDN 227."],
              [wiki("Basic land"), "Plains, Island, Swamp, Mountain, Forest, Wastes, and their snow-covered versions. A deck can have any number of them."],
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
