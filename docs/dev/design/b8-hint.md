# b8-hint: the Shop hint fits at 360 px on every weekday

Release blocker for beta.8. Terms from GLOSSARY.md (Shop, Line, Meal Slot, Planned Meal, Restock).

## Problem

P23 failed on 2026-11-14 (a Saturday) at 360 px on /shop: "Sat Breakfast +2" was shown in 90 px and cut by 8 px. It passed the
day before ("Fri Dinner +2"). The hint is "<weekday> <Meal Slot> +N" (b8-shop, b8-polish: the copy stays), so its width depends on
the day the guard runs and on the seeded Meal Slot. A real phone user with a Wednesday Breakfast sees the same cut.

Measured (Figtree 500, 13 px, the meta type token): "Sat Breakfast +2" 97 px, "Wed Breakfast +2" 104 px, "Wed Breakfast +12"
109.4 px (the widest weekday x seeded Meal Slot with a two-digit count). At 360 px the text column is 108 px: page 328, row padding
32, tick 44, Thumb 40, value column 68 (`--row-value-narrow`), three 12 px gaps; the meta's info icon (14) and gap (4) leave 90 px.

## Fix (layout only; copy and the compact Restock reason unchanged)

Below 420 px (the breakpoint of `useNarrowChips`, which already makes the Restock reason compact), in `web/src/features/shop/shop.css`:

| What | Before | After | Gain |
|---|---|---|---|
| `.shop-lines .list-row` gap | `--space-3` (12) | `--space-2` (8) | 12 px |
| `.shop-lines .list-row` padding-inline | `--space-4` (16) | `--space-3` (12) | 8 px |
| `.shop-lines .list-row__control` start margin | 0 | `calc(-1 * var(--space-2))` (-8) | 8 px |
| `.shop-lines .list-row` `--row-value-min` | `--row-value-narrow` (68) | `calc(var(--row-value-narrow) - var(--space-2))` (60) | 8 px |

The tick keeps its 44 px hit area; it reaches 8 px into the row's start padding, so its visible 24 px circle sits 14 px from the
row's edge (a Not needed row's Thumb starts at 12 px). shop.css keeps `44px` on the tick itself and
no `max-width` (shop.css.test.ts), so the block is `@media (width < 420px)` and the margin is a token. The value column stays end-aligned (quantities still line up). The meta text gets
126 px at 360 px beside a short quantity. *Review:* the first cut (16 px padding, 118 px) failed the pinned guard on the seeded
Cauliflower, whose "12000 g" makes the value column 75 px (the minimum is only a minimum): 111 px for 113 px of text. With 12 px
padding that row gets 119 px. The compact Restock reason fits too. Nothing changes
from 420 px (the text column is at least 138 px there). No shared file (`web/src/ui/**`, `styles.css`) changes.

## Guard: the worst case every day

The `shopHints` setup (`scripts/check-page-layout.mjs`, shared guard file, a small change) pins every food Line's hint to the worst
case before P23 measures it: the widest "<weekday> <Meal Slot>" of the household (the seven short weekdays x the Meal Slot names of
`/api/meal-slots`, measured with a canvas in the meta's own computed font) followed by " +12". Only the To get section (`.shop-open`) is pinned; the Supplies group is its own section. It writes the text node's data (the
node React owns), so the layout is the real one and only the text is pinned. P23 and the probe are unchanged. The scenario now fails on
every day the layout is too narrow, not only on the days with a long weekday.

## Tests

- `web/src/features/shop/components/shop.hintNarrow.css.test.ts`: the below-420 px block in shop.css sets the gap, the tick margin
  and the value minimum through tokens.
- `web/src/app/pageLayoutRules.b8hint.test.ts`: the `shopHints` setup pins the hint to the worst case (seven weekdays, the
  household's Meal Slots, "+12"), measured with a canvas, before the probe runs; P23 is still always-fail.

## Files

`web/src/features/shop/shop.css`, the two tests above, `scripts/check-page-layout.mjs` (the `shopHints` setup only), this note.
