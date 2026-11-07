// The help pages built into the app, shown in the Help view. Pure module:
// plain data and text helpers, no DOM. When the app changes, check these
// pages too (AGENTS.md, "Keep the docs in step").
//
// Text can mark a UI label in bold with **double asterisks**. Nothing else
// is markup, and the Help view never parses HTML.

import {
  APP_NAME, BACKUP_REMINDER_DAYS, HISTORY_LIMIT, MAX_DRAW, MIN_DRAW, SMALL_POOL_SIZE,
} from "./config.js";

/** The nerd mode tooltip. The Nerd mode help page repeats it word for word. */
export const NERD_MODE_TIP =
  "Nerd mode shows more details on every card: mana value, power and toughness, set and rarity, " +
  "release date, price, EDHREC rank, and legality in Standard and Brawl. Cards get smaller, so more fit on the screen.";

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
          { p: `${APP_NAME} helps you discover Magic: The Gathering cards, learn what they do, and see how they work together. It runs in your browser and gets card data and images from Scryfall. It has no server and no accounts.` },
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
              ["Help", "These pages."],
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
          { p: "A preset is a saved set of filters. The built-in presets are **Arena Standard**, for cards legal in Standard on MTG Arena, and **Arena Brawl**, for cards legal in Brawl on MTG Arena, with colors read as color identity." },
          {
            steps: [
              "Choose a preset, then select **Apply**.",
              "To narrow the search, select **Filters**. You can filter by format, game, colors, card types, mana value, rarity, keywords, and rules text.",
              "To keep your filters for later, select **Save as preset** and enter a name.",
            ],
          },
          { p: "Each active filter shows as a chip under the preset. To remove a filter, select **×** on its chip. The app shows how many cards match." },
          { p: "If you know Scryfall's search syntax, type it in **Scryfall search** in the filters. Its chip says **Custom search**. A search from Explore shows where it came from instead, for example \"Works with Lotus Cobra\"." },
          { p: "To see the same search on the Scryfall website, select **Open on Scryfall**." },
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
          { p: `The app asks Scryfall for one card at a time, at most two a second, so a big draw takes a while. If ${SMALL_POOL_SIZE} cards or fewer match, the app gets them all at once and draws from them, which is fast.` },
          { p: `Your last ${HISTORY_LIMIT} cards are under **Recent draws**, at the bottom of Discover.` },
        ],
      },
      {
        heading: "Browse every match",
        blocks: [
          {
            steps: [
              "Select **Browse all**.",
              "Choose **Sort by** and **Order**, for example mana value, release date, or popularity.",
              "Select **Show cards**. The app loads 175 cards at a time. Select **Load more** for the next ones.",
            ],
          },
        ],
      },
      {
        heading: "Saved cards",
        blocks: [
          { p: "A card you already saved shows **Saved in** and the name of the list." },
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
              "The rules text.",
              "What the card's keywords mean, with links to the MTG Wiki.",
              "The official rulings. Select **Show rulings** to load them.",
              "Legality in the MTG Arena formats.",
              "The printing, prices, and links to buy the card.",
              "Links to Scryfall and EDHREC.",
            ],
          },
          { p: "On a wide screen, point at a card, or move the keyboard focus to it, to see the same details in the panel beside the cards." },
        ],
      },
    ],
  },
  {
    id: "explore",
    title: "Explore",
    summary: "Synergies, similar cards, and counters for any card.",
    sections: [
      {
        blocks: [
          {
            steps: [
              "Select **Explore** on any card, in Discover or in a list.",
              "Choose a tab.",
              "Select **Search** next to an idea. Discover opens that search in Browse all, most popular first.",
            ],
          },
          {
            terms: [
              ["Synergies", "Cards that work with this one, such as \"Green cards that leverage landfall\". They stay in the card's colors."],
              ["Similar", "Cards that do the same job for a similar cost, share its keywords, or share its type and cost."],
              ["Counters", "Cards that answer this one, such as creature removal or cards that punish fliers. They're in every color."],
            ],
          },
          { p: "The search keeps your format and game, and leaves out the card itself. Its chip in Discover says where it came from." },
          { p: "The ideas come from the card's rules text and from Scryfall Tagger tags, which the community maintains. Check the results before you build around them." },
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
          { p: "A list is a **Collection** or a **Deck**. A deck has a format: **Standard**, **Standard Brawl**, or **Brawl**. You can change the kind and the format at any time, and the cards stay." },
          { p: "If you remove a card from a list, select **Undo** to put it back." },
        ],
      },
      {
        heading: "Check a deck",
        blocks: [
          {
            terms: [
              ["Standard", "At least 60 cards in the main deck, at most 15 in the sideboard, at most 4 copies of a card except basic lands, and only legal cards."],
              ["Brawl and Standard Brawl", "A commander, 100 cards for Brawl or 60 for Standard Brawl, one copy of each card except basic lands, cards in the commander's color identity, and only legal cards."],
            ],
          },
          { p: "Legality comes from the card data saved with the list. To get current data, select **More**, then **Refresh card data**." },
          { p: "**Deck stats** shows the mana curve, the colored mana symbols, and the card types." },
        ],
      },
      {
        heading: "Export a deck to MTG Arena",
        blocks: [
          {
            steps: [
              "Open the deck in **Lists**.",
              "Select **Export for Arena**, then select **Copy**.",
              "In MTG Arena, open **Decks**, then select **Import**.",
            ],
          },
          { p: "To see a whole list on the Scryfall website, select **Open on Scryfall**. A long list opens in two or more parts, because Scryfall searches have a length limit." },
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
          { p: "Your lists, presets, draw history, and settings are stored only in this browser, on this device. They don't sync between devices or browsers. If you clear the browser's site data for the app, they're deleted." },
          { p: "The app sends Scryfall your card searches, and the Scryfall IDs of cards when you refresh a list or show rulings. It doesn't send list names, notes, or anything else about you." },
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
          { p: "Safari deletes a site's data after 7 days of Safari use without a visit. To keep your lists, add the app to your Home Screen: in Safari, select **Share**, then **Add to Home Screen**. Then open the app from its icon." },
        ],
      },
      {
        heading: "Credits",
        blocks: [
          { p: `Card data and images are from Scryfall. ${APP_NAME} isn't made by or endorsed by Scryfall.` },
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

/**
 * Splits text into plain and bold parts at **double asterisks**.
 * @param {string} text
 * @returns {{text: string, strong: boolean}[]}
 */
export function inlineParts(text) {
  return text.split("**").map((t, i) => ({ text: t, strong: i % 2 === 1 })).filter((p) => p.text !== "");
}

const plain = (text) => text.replaceAll("**", "");

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
