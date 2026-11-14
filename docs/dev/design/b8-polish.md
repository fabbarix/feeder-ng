# b8-polish: four small decisions from review

Design note for team polish (beta.8). Each item is a user decision made in review. Tests are written first; the developer makes them pass.

## 1. Shop hint copy stays "Fri Dinner +2" (docs only)

No "Includes" in the row hint. `docs/design/system.md` §3 now shows "ⓘ Fri Dinner +2" (was "ⓘ Includes Thu Dinner"); `docs/dev/design/b8-shop.md` records the decision. The long sentences ("Includes Tue Dinner, not marked Cooked yet" in the notice and the Line sheet, functional-spec §7) are unchanged: they are not the one-line hint. Developer: only the stale doc comment on `ListEntry.hintShort` in `features/shop/lib/lines.ts` (line 41 says `"Includes Tue Dinner"`) should say "Tue Dinner +1". No test.

## 2. Compact Restock reason on narrow rows

Problem: at 360 px "400 of 1000 ml" needs 93 px in a 90 px column (cut by 3 px).

**Format** (`web/src/lib/amountOf.ts`, shared; no React): `amountOf` keeps its signature and result. New `amountOfText(x, y, base, system, opts?: { compact?: boolean }): string`: full is `"x of y"` (the existing join), compact is `"x/y"` with no spaces around the slash and the same one-unit-on-y rule: "400/1000 ml", "2/6", "800/1200 g", imperial "7.1 oz/1 lb 2 oz". Float dust and negative x read 0 as now. The Scanned rows can call it later; not wired now.

**When it applies** (decided): below 420 px, the same query as the header chips (`useNarrowChips`, `!useMediaQuery('(min-width: 420px)')`). The decision is made by the hook, never by a component's logic:
- `ShoppingScreen` already calls `useNarrowChips()`; it passes `compact={narrow}` to `ShoppingBody`, which passes it to `LineRow`.
- `lib/supplies.restockText(restock, baseUnit, system, opts?)` takes the option and calls `amountOfText`. `ListEntry` gains `restockCompact: string` (the compact text for a Supply Line that is not ticked, else `''`); `restockText` stays the full text.
- `lib/rows.rowMeta(entry, opts?: { compact?: boolean })`: with compact and a `restockCompact`, returns `{ text: compact, status: 'info', fullText: full }`; otherwise as before (no `fullText`). `RowMeta` gains optional `fullText`.
- `LineRow` renders the meta; when `fullText` is set it paints the compact text with `aria-hidden="true"` and gives the full one as accessible text in a `.visually-hidden` span after it (the codebase's pattern for screen-reader-only text, as in CourseChips and MealSlotWeekStrip; review replaced a `span role="img"`, which would announce text as an image). The hidden span is absolutely positioned, so P23 measures what is painted.
- At 420 px and wider, and without `matchMedia` (jsdom), nothing changes.

**Guard**: P23 reads the Supplies group again. Remove the `closest('.shop-supplies')` skip and the "waits for a design decision" comment from `cutMetaProbe` in `scripts/check-page-layout.mjs`. `shopSuppliesGroup` waits for `.shop-supplies .list-row__meta[data-status="info"]` (a Restock reason). Scenario `shop-hints` gets 360 px (`[360, 390, 834, 1440]`); `shop-supplies-group` already has 360. The seeded Supply must read "400 of 1000 ml" (an ml Supply with Stock 400 and Restock level 1000): the page-layout seeder should have one; if not, add it to the seeder (not to a shared fixture other teams use). Check in a browser: `scripts/check-page-layout.sh` at 360 px has no P23.

## 3. Lot sheet "Move to": hint "Choose a Storage Place"

`features/stock/components/LotSheet.tsx`: the Storage Place `Select` gets `placeholder={strings.chooseStoragePlace}` (new string "Choose a Storage Place" in the stock strings file, no longer `from ? from.name : strings.unsorted`) for every Lot. The sheet already says where the Lot is. `strings.unsorted` stays if something else uses it. Test: `LotSheet.placeholder.test.tsx` (rewritten).

## 4. No ready toast for a read with nothing to change

`features/receipt/lib/backgroundCopy.finishedToast`: a `ready` state with `changes === 0` returns `undefined`. `ReceiptReadWatcher` already shows nothing for `undefined`, so it needs no code change. `rowView` and `readyTitle(0)` are untouched: the Scanned list row still says "Receipt read: nothing to change", opens the review, and keeps its Dismiss button. Docs updated here: `docs/design/receipt-reading.md` §3.3 and `docs/dev/design/b8-rxweb.md` (toast copy).

## Tests (written first, failing)

| File | Pins |
|---|---|
| `web/src/lib/amountOf.compact.test.ts` | `amountOfText` full and compact |
| `web/src/features/shop/lib/supplies.compact.test.ts` | `restockText` option, `restockCompact`, `rowMeta` compact |
| `web/src/features/shop/components/ShoppingBody.compact.test.tsx` | `compact` prop: visible text and accessible text |
| `web/src/features/shop/screens/ShoppingScreen.compact.test.tsx` | below 420 px compact, from 420 px full |
| `web/src/app/pageLayoutRules.polish.test.ts`, `pageLayoutRules.b8shop.test.ts` (one assertion flipped) | P23 covers Supplies, 360 px scenarios |
| `web/src/features/stock/components/LotSheet.placeholder.test.tsx` | the hint, for a Lot with and without a place |
| `web/src/features/receipt/lib/backgroundCopy.test.ts`, `components/ReceiptReadWatcher.test.tsx` | no toast at 0 changes, row unchanged |

No Gherkin: nothing here is a new server behaviour, and the repo has no browser-level Gherkin runner (b8-rxweb). Not touched: `internal/shopping/**`, the Shop screen's Undo and tick code.
