# beta.8 pantry: the H8 layout gaps of the Pantry Filters, the Supplies chip and the sheet subheaders

Team pantry. Base: main at af625a03 (1.0.0-beta.7). Sources: [pantry-filter.md](../../design/pantry-filter.md),
[household-items.md](household-items.md) (§4.6, §6), [shop-scan-proposals.md](../../design/shop-scan-proposals.md), [system.md](../../design/system.md).

## What beta.7 shipped (so this is only the remainder)

H5 to H7 and H9 built the Supplies screens, the "Food or Supplies" section of the Filters panel (`?stock=food|supply`, its row 3 chip),
the "Ingredients" / "Supplies" subheaders in the Add Stock Lot Ingredient `Select`, and Used up in the Lot sheet. H8 in the plan
(household-items §7) was the guards and the release, and shipped as the page-layout routes (30d776a7). The guard measures overflow of
the page and of chips, not what a popover does to its own content, so the visual gaps below went through. Nothing in the data, URL or
copy changes here.

## How the gaps were found

A beta.7 build (`go build` + `vite build`), a scratch data dir seeded with `scripts/test/fixtures/page-layout-seed.mjs`
(3 Supplies, 10 Storage Places), headless Chrome over CDP. Screenshots in `build/shots/` of the worktree (not committed):
`pantry-filters-{390,1280}.png`, `pantry-supply-chip-{390,1280}.png`, `pantry-supply-ingredients-{390,1280}.png`, `supplies-{390,1280}.png`,
`lot-supply-{390,1280}.png`, `addstock-select-390.png`, `addstock-supplies-subheader-{390,1280}.png`, `newsupply-{390,1280}.png`.

## Gaps and fixes

| # | Gap against the design | Fix | Files | Tests |
|---|---|---|---|---|
| G1 | **Filters popover overflows its own footer from 768 px up.** `useFloatingPopover` caps the panel with a `max-height` (710 px at 900 px high), `.popover` is `overflow: visible` and its body never shrinks. With the Food or Supplies section (+82 px, pantry-filter §3 was sized without it) the body needs 642 px of 596 at 1280 x 900: "Group by Storage Place" sits on top of "Clear filters" / "Show Stock" (`pantry-filters-1280.png`). At 1024 x 768 the body needs 642 of 472: the switch is at y 852, below the window. The phone sheet is fine (the sheet scrolls). | `.filter-panel .popover__body { overflow-y: auto; overflow-x: hidden; min-block-size: 0 }` in the shared `FilterBar.css`: the body scrolls inside the cap, the title and footer stay. The list cap `min(16rem, 40dvh)` stays. Recipes' panel benefits too (same class); its body fits today, so nothing changes there. | `web/src/ui/FilterBar/FilterBar.css` (shared, one rule) | `ui/FilterBar/FilterBar.scroll.css.test.ts` |
| G2 | **The Food and Supplies chips have no icon.** The Kind chips beside them (Pantry, Fridge, Freezer) and the Kind chip in row 3 lead with one; the "Supplies" chip in row 3 (`pantry-supply-chip-*.png`) and both panel chips are bare, so the Supply concept has no mark here although `supply` (Phosphor `SprayBottle`) exists since H5 and household-items §6 names it for the Pantry. | Panel chips: `icon: 'supply'` for Supplies, `icon: 'ingredients'` (Carrot) for Food. Row 3: the chip descriptor gets the same `icon`. Chips stay neutral (not accent, not status coloured: pantry-filter §4.2). No new icon, no bundle change. | `features/stock/components/PantryFiltersPanel.tsx`, `features/stock/lib/pantryFilters.ts` (`pantryFilterChips`) | `lib/pantryFilters.stockIcons.test.ts`, `components/PantryFiltersPanel.stockIcons.test.tsx` |
| G3 | **A group's subheader is not set off from the rows above it.** In the Ingredient `Select` (sheet and popover) "SUPPLIES" follows the last Ingredient row ("Yoghurt") with 8 px, the same as the 8 px under a row; it reads as part of the previous group (`addstock-supplies-subheader-1280.png`). The first subheader sits on the list edge, correctly. | `.select__group + .select__group { margin-block-start: var(--space-2) }` (one rule in the shared `Select.css`; the sticky opaque subheader and the `role="group"` markup are unchanged and pinned by the test). Applies to every grouped Select (Units, Meal Slots, Shop extras): a gain there too. | `web/src/ui/Select/Select.css` (shared, one rule) | `ui/Select/Select.groups.css.test.ts` |
| G4 | **Used up has no unit.** In the Supply Lot sheet "How much was used up" shows no unit while "How much to move" two fields below shows "piece" (`lot-supply-*.png`). | `suffix={lot.baseUnit}` on the Used up `TextField`. | `features/stock/components/LotSheet.tsx` | `components/LotSheet.usedUpUnit.test.tsx` |

Checked and fine (no change): the chip layout of row 3 at 390 and 1280 (one line, no wrap, Filters shows its count); the Filters sheet at
390 (sections in the order Show, Food or Supplies, Kind, Storage Place; footer in one line); "Ingredients" / "Supplies" subheaders present,
sticky and opaque in the Add Stock Lot select at both widths (a sticky header is scoped to its group, so "SUPPLIES" replaces "INGREDIENTS"
as it scrolls); By Ingredient with the Supplies filter; the New Supply sheet (Name, Base Unit `Segmented`, Restock level, Picture) at
both widths.

Not done, left for the user: the Storage Place `Select` of the Lot sheet shows an empty value for a Not sorted Lot (no placeholder, such as
"Choose a Storage Place"); not an H8 item. Supply rows say "restocks below 20" when stocked and "below Restock level 4" when low: the
split is deliberate (H6 copy).

## Not behaviour: no BDD

Every change is visual or a label: no flow, URL or rule changes, so no Gherkin scenario is added (`bdd/features/supplies/**` already
covers the filter and Used up). The page-layout guard (`SCENARIOS pantry-filtered-open`) would catch G1 if it measured a popover's
content against its footer; adding that rule is a guard change (shared, not this team's) and is proposed, not done: P23 "an open
Popover's last child ends above its footer, or its body scrolls".

## Developer's notes

- G1 and G3 are one CSS rule each in shared files; keep them minimal and tell the main session (merge ordering with other teams' shared edits).
- After G1, check the focus ring of the first chip group and of the Switch is not cut by the body's `overflow` (the body already has
  `padding-inline: var(--space-2)`; the chip group is padded by the ring). If the ring of the Switch is cut, add `padding-block: var(--space-1)` to `.filter-panel__body`.
- Never copy markup; no hard-coded colours; `scripts/check-ui.sh` must stay green.
