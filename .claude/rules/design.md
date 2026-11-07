---
paths:
  - "styles.css"
  - "index.html"
  - "src/ui/**"
  - "icons/**"
---

# Design

Cascade's look is a blend of GitHub's [Primer](https://primer.style) and Vercel's [Geist](https://vercel.com/geist/introduction): clean and neutral, with color from the cards. The playful Brewmancer look was turned down on 7 November 2026, and this blend replaced it.

## Tokens

- Use the variables at the top of `styles.css` for every color, radius, gap, and control size. Add a token before you add a new value.
- Every color token has a dark-mode value. Light and dark must look equally finished.

## Shape and color

- Corners: 6px on controls (`--radius`), 8px on panels (`--radius-lg`), and 12px on dialogs and sheets (`--radius-xl`). Borders: 1px.
- No gradients, glows, or decorative color. Shadows are quiet, and only on raised layers such as menus and tooltips.
- Blue is for links, focus, and selection only. Status colors (success, warning, error) are for status only.

## Type

- The system font stack (`--font`). The mono stack (`--mono`) only for data.
- Sentence case everywhere. In help text, UI labels are in bold.

## Buttons and icons

- One primary button per view: black in light mode, white in dark mode. The rest are secondary.
- Most buttons have an icon and a text label. Never use an icon without a label, and never let the label become a tooltip only.
- Draw icons as inline SVG in the style of [Primer Octicons](https://primer.style/octicons/): a 16px grid, a single stroke weight, and `currentColor`. Hide the icon from screen readers (`aria-hidden="true"`), because the label names the button.

## Motion

- Subtle: short fades for panels, menus, and messages, about 150 ms.
- No motion when `prefers-reduced-motion: reduce` is set.
- Never animate a card image.

## Density

- Balanced, with big cards by default.
- Nerd mode adds detail and makes the cards smaller. Extra data such as prices, salt scores, and bracket tags waits for nerd mode or **Details**.
- In combos: compact in the results, big on the combo itself.

## Card images

Never crop, clip, cover, stretch, filter, or transform a card image, and never put an element over one. Every marker, such as **Saved in**, goes in the caption below the image.

## Layout and access

- Phone first. Then tablet and desktop: the app is used on an iPhone, an iPad, and a Mac.
- Tap targets are at least 44px (`--tap`). Nothing scrolls sideways at 390px.
- Every control has a label. Every status message goes through `announce()`. Focus is always visible.

## Copy

- Plain words. No Scryfall query syntax in the main interface: filter chips, Explore, results, and history. Name searches in plain words, as filter chips do, and offer **Open on Scryfall**. Syntax is fine in the **Scryfall search** field, its hint, and Scryfall's warnings about a typed query.
- A control says what it does: **Export for Arena**, not **Export**.
- A tooltip explains what a switch does, on hover and on keyboard focus, as the nerd mode tooltip does.

Issue #11 applies the icon and motion rules to the app.
