# R2-2: Today and Plan adoption (UI review 2)

Team R2-2, pipeline step 1 (design and red tests). Spec: `docs/design/ui-review-2.md` (package R2-2: L-05, L-07, K4). Files owned: `web/src/features/{today,plan}/**` (not `PlanningRulesScreen` / `RulesEditors`, which are R2-3's), including `plan/plan.css`.

## 0. Scope check against the review

| Item | Status on main (9534701) | This team |
|---|---|---|
| **K4** Couldn't plan as one pink tile | Done by R13 (grouped by cause, warn/info tone, one fix per cause, setup checklist, attendance default). Re-verified in code: `CouldntPlanTile` per cause, span 2, no danger tone. | Only one follow-up: the info tone should use `--color-info-*` (I-1). |
| **L-05** Plan cramped at 1440+ | Open. `/plan` is already `wide` (1480) in `app/pageWidths.ts`, but the columns come from the **viewport** (`usePlanColumns`: 7 from 1200), so at 1440 the grid sits in about 1160 px beside the 240 px rail and shows seven ~140 px tiles. | P-1 |
| **L-07** Today is a stretched phone | Open. Hero primary is a bare grid child, so it is as wide as the tile; Today's Bento is 2 columns at every width. | T-1, T-2, T-3 |
| L-06 lists spanning the width | Not Today/Plan (Stock, Ingredients, Products, Settings, Scan, Members, Meal Slots): R2-3 / R2-4. Today and Plan have no single-column list screens. | none |
| L-08 Cook Mode on phone | `features/cook`: R2-4. | none |
| Board layout items | None in the review for `features/board`; the table gives the board to **R2-4**. Not touched. | none |
| "Throw out or keep?" rows as `ListRow`s with trailing actions (L-07, second half) | The tile is `SpoiledTile` in `features/stock` (R2-4's files). | handed off, see section 5 |

## 1. Plan (L-05)

**P-1 Columns follow the container.** `lib/columns.ts planColumnsForContainer(width)`: 7 from 1200 px of container, 4 from 560, else 2. New hook `hooks/useContainerColumns()` returns `{ ref, columns }`; `ref` goes on a wrapper around the week grid, and a ResizeObserver feeds `planColumnsForContainer(contentRect.width)`. Before the first measure, and without ResizeObserver (jsdom), the answer is 4: never the cramped 7. `PlanScreen` uses it instead of `usePlanColumns`; `compact` (short weekday, time-only head) still means `columns === 7`. The notice grid keeps `columns === 7 ? 4 : columns`.

Result: 390 phone = 2; 820 tablet (container about 640) = 4; 1440 with the 240 px rail (container about 1160) = 4 with day tiles of ~270 px and full names; 1920 (container 1480, the wide page) = 7 with ~200 px tiles. `usePlanColumns` and `planColumns` become unused: delete them with their old tests (`hooks/wp6.hooks.test.tsx` usePlanColumns block, `lib/columns.test.ts`, the matchMedia `widthStub`s in `PlanScreen.test.tsx` that expect 7 columns on a desktop viewport). Those edits belong to the Developer because the old expectations are being replaced, not added.

## 2. Today (L-07)

**T-1 Hero action row.** `TonightHero` puts the primary (and the Yes, Cooked / Reheat / Adjust pair) in `.plan-hero__actions` always; the primary is `size="lg"` and `block="phone"` (full width below 600 px only, auto width above). `plan.css`: from 820 px `.plan-hero__actions { justify-content: flex-end }`, so the button sits at the tile's bottom-right. No `width: 100%` on its buttons.

**T-2 Three-column Bento from 1280.** `today.css` (the Today owns its grid, the `BentoGrid` primitive stays at 2): `@media (min-width: 1280px)` the grid inside `.today` is `repeat(3, minmax(0, 1fr))` with `grid-auto-flow: row dense`. The hero (`.plan-hero`) is `grid-column: span 2; grid-row: span 2`. Full-span tiles (Throw out or keep?, To confirm, Couldn't plan, setup) stay `1 / -1`; `dense` lets Use soon, Leftovers and the streak back-fill the third column beside the hero. Between 820 and 1279 the grid stays at 2 columns (tiles of ~270 px: fine).

**T-3 To confirm rows.** `.plan-confirm` is two columns from 820 px (`minmax(0, 1fr) auto`, centred): the Recipe and slot line at the start, the three buttons at the end, one row per meal instead of a stack.

**T-4 No double gutter.** `.today` has `padding: 16px` on all sides while the shell's `Page` already adds the side gutters. Keep `padding-block`, drop the inline padding.

## 3. Info tone (I-1)

`--color-info-fg` / `--color-info-bg` exist (styles.css). `toneStyle('info')` should read `{ tile: { variant: 'status', status: 'info' }, chip: { kind: 'status', status: 'info' } }` (blue tile and chip, instead of the neutral soft tile). Depends on the primitive request below; do the plan change in the same merge as, or after, R2-1's primitive.

## 4. Page guard

Once T-1..T-4 and P-1 are in, `/` and `/plan` go to `fail_routes` in `scripts/check-page-layout.modes`. The test `today/layoutRoutes.r22.test.ts` expects both. I did not edit the modes file (R2-1 and R2-3 edit the same line; the PM appends `/ /plan` when merging, and the Developer does it at the end of this branch).

## 5. Hand-offs, primitive requests, questions

- **Primitive request (R2-1, `ui/`)**: `Tile` and `Chip` accept `status="info"` (colours `--color-info-bg/-fg`, an `info` icon default for the chip). Needed by I-1.
- **Hand-off to R2-4 (`features/stock`)**: L-07's second half, `SpoiledTile` rows as `ListRow`s with the Throw out / Keep buttons trailing from 820 px. No test written here (not my files).
- **Avatars**: no Member avatar is rendered in Plan/Today today (Meal Slot attendance is in Settings). When the pictures package adds Member photos to attendee avatars it must go through the shared `Avatar`/`MemberPill`.
- **Product question**: 7 columns from a 1200 px container gives ~158 px tiles at the threshold (the review says 1200). Name lines clamp at two lines and chips wrap, so I kept the review's number; 1320 would give ~180 px if it still looks tight.
- **Product question**: should the hero stay `span 2 x 2` when there is nothing to put beside it (only a hero)? The design leaves a 1-column hole; I'd let `.today` fall back to hero `span full` when it is the only tile, but that needs a `:only-child`-style rule the Developer can add without a test.

## 6. Red tests

| Test file | Item |
|---|---|
| `plan/lib/columns.container.test.ts` | P-1 thresholds |
| `plan/hooks/useContainerColumns.test.tsx` | P-1 hook (ResizeObserver, ignores matchMedia, default 4) |
| `plan/screens/PlanScreen.columns.test.tsx` | P-1 on the screen |
| `plan/components/TonightHero.layout.test.tsx` | T-1 |
| `plan/plan-layout.r22.test.ts` | T-1 / T-3 CSS (the `min-width: 0` day tile check is a green guard) |
| `today/todayLayout.r22.test.ts` | T-2, T-4 |
| `today/layoutRoutes.r22.test.ts` | page guard routes |
| `plan/lib/couldntGroups.test.ts` (edited) | I-1 |

Type-only stubs: `planColumnsForContainer` (returns the old viewport function) and `useContainerColumns` (always 7).
