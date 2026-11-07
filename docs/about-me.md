# About me

I'm building Cascade for myself first. What I say I want outranks research and anything inferred about "players like me". This page comes from an interview and a use session on 5 November 2026, at the start of the design overhaul, and my feedback on 7 November 2026. When I ask for something new, add it here, in my voice.

## Me as a player

- I play mostly on MTG Arena. My formats are Standard and Commander, and I'm open to other modes.
- I don't play Brawl on Arena yet, but I want to start.
- I use the app on a Mac (desktop browser), an iPad, and an iPhone.
- My other tools are Scryfall's website, Moxfield or Archidekt, and EDHREC or content creators.

## What I want from the app

All of these:

1. Surprise and discovery.
2. A card or theme to build a deck around.
3. Filling gaps in a deck I'm building.
4. Learning the card pool.
5. "Finding dynamics and combinations between cards, learning about mechanics and how they work together." Learning is "a big part of it". I want keyword explanations, rulings, and why two cards work together.

## Taste

- Look: clean. I like GitHub's Primer design system and Vercel's design system (Geist). On 7 November 2026 I said I didn't like the look of the overhaul, and I chose a blend of the two. This replaces "playful", which I gave on 5 November.
- Density: "Balanced with big cards with a toggle for detailed/nerd mode."
- Name: Cascade, chosen on 7 November 2026. I didn't like "Brewmancer".
- I don't need to see Scryfall query syntax. **Open on Scryfall** is enough.
- Everything an agent writes for this project, in the repository and on GitHub, is in my voice, as me. Never refer to me in the third person or by a role.

## What bothered me in version 1

Finding cards felt clunky, Find synergies was too loose, lists and decks were awkward, and the app looked plain or dated.

## What I asked for, and where it is

| My request | In the app |
| --- | --- |
| List every match for a query and sort it however I like, such as by mana value or release date. I also asked to "draw all". | **Browse all** in Discover, with 11 sort orders and Load more. |
| Hover over a card to see all the nerdy details. | The inspector beside the cards on wide screens, and **Details** everywhere. Nothing covers the card image. |
| Open all cards in a list on Scryfall. | **Open on Scryfall** on each list, split into parts for long lists. |
| Links to buy cards. | **Prices and buying** in the details. |
| Export a list as an Arena deck. | **Export for Arena**, now the main button on each list. It existed in version 1, but I didn't find it. |
| A "similar cards" feature. | The **Similar** tab in Explore. |
| Show when a card is already saved, in the search results. | **Saved in** on every card. |
| Richer synergies, such as "other green cards that leverage landfall" or "white cards that benefit from enchantments". | The **Synergies** tab in Explore, built on Scryfall Tagger tags. |
| A "Counters" feature: cards or strategies that counter a given card. | The **Counters** tab in Explore. |

### Feedback on 7 November 2026

| My request | In the app |
| --- | --- |
| A new name. I didn't like "Brewmancer". | Cascade. |
| A cleaner look, like GitHub's Primer or Vercel's design system. | A blend of the two: neutral grays, the system font, 6px corners, 1px borders, a blue accent, and black or white primary buttons. |
| Make clear what nerd mode does, with a tooltip when I point at the switch. | A tooltip on hover and on keyboard focus. The **Nerd mode** help page repeats it. |
| Documentation pages in the app. Agents must always check whether the docs need an update after any change. | The **Help** view, from `src/docs.js`. `AGENTS.md` has the rule under "Keep the docs in step". |
| Draw more than 10 cards. | Up to 30 at a time. |
| A redraw prefers cards that weren't drawn recently for the same query. | Draws skip cards in the recent draws for the same search, and fill up with them only when there aren't enough new ones. |
| Don't show the full Scryfall query. **Open on Scryfall** is fine. | The query is gone from Discover, Explore, and Recent draws. **Open on Scryfall** stays. |
| The raw query chip under the preset wasn't helpful. | The chip names the search in plain words, such as "Works with Lotus Cobra: Green cards that leverage landfall". Typed syntax shows as **Custom search**. |
| Always push, open a pull request, and merge. | `AGENTS.md`, under "Ship it yourself, always". |
| Never refer to me in the third person. Write everything as me. | This page, `AGENTS.md`, and a test in `tests/docs.test.js` that fails if a doc talks about me in the third person. |

## Open questions

I haven't answered these yet:

- "Draw all": did I mean a sortable list of every match (built as Browse all), or a shuffled reveal of the whole pool?
- Buy links: do I want prices shown everywhere, or only in nerd mode and the details? Prices currently show in both.
- Similar cards: does "similar" mean what a card does, how it plays, or how it looks? The app currently uses role, keywords, and type plus cost.
