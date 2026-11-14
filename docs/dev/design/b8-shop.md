# beta.8 team shop: Shop header chips, Shop hint, phone wordmark

Three small layout items. Terms from GLOSSARY.md (Shop, Planned Meal, Meal Slot); no `_Avoid_` word in the copy
(so "Includes 2 meals" is out: Meal is avoided for Planned Meal).

## 1. Shop header chips keep their icons (user decision)

**Why.** beta.7 hid the calendar and storefront icons below 420 px so "Until Fri 20" and "Any Shop" fit at 360 px. The user
wants the icons at every width and shorter labels instead.

**What.**
- Delete the `@media (width < 420px) { .shop-screen__controls .select__leading { display: none } }` rule in
  `web/src/features/shop/shop.css`. Nothing in the Shop hides `.select__leading` at any width.
- Below 420 px (`useMediaQuery('(min-width: 420px)')` is false) the chips show a short value; the list (popover or sheet)
  always shows the full labels.

| Chip | Wide | Narrow (< 420 px) |
|---|---|---|
| Shop for (calendar icon) | Today / Until tomorrow / Until Fri 20 | Today / Tomorrow / Fri 20 |
| Shop (storefront icon) | Any Shop (or the Shop's name) | Any (a Shop's own name is shown as is) |

"Until" is dropped (the calendar icon and the "Shop for" name say it); "Any Shop" becomes "Any" (the storefront icon says
Shop). No truncated abbreviations.
- Accessible name: unchanged, the combobox stays named by its label ("Shop for", "Shop"). When the chip shows a short value
  the trigger gets `title` = the full value ("Until Fri 20", "Any Shop") so the full wording stays reachable.
- Library: `lib/range.ts` gets `shortRangeLabel(to, today)`; `rangeOptions` options carry `short`. `strings.ts` gets
  `anyShopShort: 'Any'`.
- Shared `ui/Select` (small change): option `triggerLabel` already exists; when a chip's selected option has a `triggerLabel` that
  differs from its `label`, the trigger gets `title` = the label. `ShopChoice` (`ui/Select/options.tsx`) gets optional `shortName`,
  which `shopOptions` maps to `triggerLabel`; `shopPickerChoices(shops, anyName, anyShort?)` sets it on the "Any Shop" sentinel. The
  screen passes `strings.anyShopShort` only when narrow (a shared hook `useNarrowChips` = `!useMediaQuery('(min-width: 420px)')`,
  also used by `RangePicker`; without `matchMedia` it reads as wide).
- Guard: scenario `shop-header` at 360 and 390 px (P16/P22 cover crushed and cut chips) and the existing
  `shop-supplies-group` scenario.

## 2. Shop hint is cut in the card grid

**Reproduced** (static page with the real `styles.css`, `ListRow.css`, `shop.css`; build/shots/repro-meta-834.png and
-1440.png): at 834 px the card is about 387 px wide, the text column is what is left after padding (32), tick (44), Thumb (40),
value column (5.5 rem = 88 px) and the gaps (4 x 12 px): about 180 px, and 135 px at 1440 px in 3 columns. "Includes Tue
Dinner and Wed Lunch" (33 characters plus the 14 px icon) needs about 230 px, so it ends in an ellipsis and the Meal Slots are lost.
Cause: copy that grows with the number of slots, in a column that has the least room of the row.

**Fix (within system.md 3: one line, ellipsis stays as the safety net).**
1. Copy: the one-line hint (`hintShort`) names the first slot and counts the rest: "Tue Dinner", "Tue Dinner +1", "Tue Dinner +2",
   led by the info icon. The sheet and the full `hint` keep every slot, and the notice above the list says the sentence once. New
   string `slotMore(slot, n)`. *Review:* the first copy kept "Includes" ("Includes Fri Dinner +2"); P23 on the seeded hints found it
   cut at 360, 390, 1440 and 1920 px (127 px of text in a 90 to 125 px column), so the word goes.
2. Layout: in the card grid (from 768 px) the row's value column takes the phone minimum (20 px more for the text): `styles.css` gets `--row-value-narrow: 4.25rem` (the phone media
   block now sets `--row-value-min: var(--row-value-narrow)`), and `.shop-lines .list-row { --row-value-min: var(--row-value-narrow) }` in shop.css. No raw size in shop.css.
3. Guard: new rule **P23** (always fails): a food Line's Meal Slot hint (`.list-row__meta[data-status='info'] .list-row__meta-text`
   outside `.shop-supplies`) is cut by its ellipsis, on every /shop probe. Probe `cutMetaProbe` in `scripts/check-page-layout.mjs`
   (`m.cutMeta`), scenario `shop-hints` at 360, 390, 834 and 1440 px waiting for `.shop-open .shop-lines .list-row__meta[data-status="info"]`
   (a seeded Meal Slot hint). *Review:* the Supplies group's Restock reason ("400 of 1000 ml") is cut by 3 px at 360 px, as in beta.7;
   it is left out of P23 until a design decision (see the review handback).

## 3. Phone "Feeder" wordmark

`.top-bar__brand` was `display: none` below 1024 px. Now it shows at every width: a brand mark (the small basil/heart symbol of
`docs/brand/master/mark-small.svg`) and the word "Feeder" (Figtree, title-3 token, `--color-text`).
- New `web/src/app/BrandMark.tsx`: inline SVG, `aria-hidden`, `focusable=false`, two paths with classes `brand-mark__body` and
  `brand-mark__heart`; no hex in the TSX (check-ui colour-literals). Colours in `shell.css`: body `var(--color-accent)` (basil
  `#34724e` light, `#89c8a0` dark, which are the brand's light and dark), heart `var(--brand-heart)`, a new token in
  `styles.css` (`#e0763a` light, `#f4a36b` dark, the README's heart colours) with the dark override in both dark blocks.
- `AppShell`: `<span className="top-bar__brand"><BrandMark /><span className="top-bar__brand-word">Feeder</span></span>`. The wordmark is text in
  the brand's typeface (not the outlined path) so it is selectable and scales with the type token.
- No crowding: the brand is `display: inline-flex; gap: var(--space-2); min-inline-size: 0; flex: 0 1 auto`; the word is
  `white-space: nowrap`; the avatar anchor keeps `margin-left: auto`. The mark is `--space-6` (24 px).
- Update `shell.css.test.ts` ("drops the brand word on phones" becomes "shows it at every width").

## Files the developer may touch
`web/src/features/shop/shop.css`, `strings.ts`, `lib/range.ts`, `lib/lines.ts`, `components/RangePicker.tsx`, `screens/ShoppingScreen.tsx`;
`web/src/ui/Select/Select.tsx`, `options.tsx` (ShopChoice.shortName), `lib/anyShop.ts`, `hooks/useNarrowChips.ts` (new); `web/src/app/AppShell.tsx`, `BrandMark.tsx` (new),
`shell.css`, `strings.ts` if needed; `web/src/styles.css` (one token pair, small); `scripts/lib/page-layout-rules.mjs` and
`scripts/check-page-layout.mjs` (P23, probe, two scenarios, two setups).

## Tests
- `lib/range.short.test.ts`, `lib/lines.hintShort.test.ts`, `components/RangePicker.short.test.tsx`,
  `screens/ShoppingScreen.chips.test.tsx` (names, icons, short values at narrow, title), `ui/Select/Select.shortValue.test.tsx`,
  `components/shop.hint.css.test.ts` and an edit of the beta.7 icon-hiding test in `shop.css.test.ts`,
  `app/BrandMark.test.tsx`, `app/AppShell.brand.test.tsx`, `app/shell.brand.css.test.ts`, `app/pageLayoutRules.b8shop.test.ts`.
- BDD (Gherkin): none; these are layout and copy only, no backend behaviour. The browser contract is the page-layout guard
  scenarios above.
