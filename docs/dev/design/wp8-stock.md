# WP8: Stock screen (round 2)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 5.7, 2.6, 7 WP8, CLAUDE.md "No native browser UI". Scope: `web/src/features/stock/**` only. Acceptance: ListRows with separators; hooks distinguish offline / error / empty.

## Screen (`StockScreen`, no own `<main>`)
- **Avatar-menu fit.** Stock is a top-level destination of the avatar menu (WP5): bars stay, so `PageHeader title="Stock"` has **no back button**. Actions: secondary sm "Stock-take" (icon `scan`) and primary sm "Add to Stock" (icon `add`), the only primary in scope.
- Order: PageHeader, SpoiledTile (only when spoiled lots), `SearchField` "Search Stock" + filter chips All / Use soon / Spoiled (`Chip kind="filter"`, `aria-pressed`), then `ListGroup label="Stock"` of `StockRow`s. Search and chips only when status is `ready`.
- `StockRow` (new, replaces `StockTile`, deleted): `ListRow` title = name, trailing = total, meta = `rowMeta` ("1 Stock Lot · goes off Thu"), chevron, tap opens the Ingredient's BottomSheet (`LotList` as a ListGroup + secondary "Set total"). No tile paint, no "Use soon" pill; due is shown by the meta colour.
- **Status** (hook `status`, pure `resolveStockStatus`): loading -> `Skeleton variant="row" count=5`; error -> `ErrorState` "Stock could not be loaded." + Try again (`refetch`); offline -> `EmptyState` "Stock is not saved on this device yet" (icon `offline`); empty -> "Nothing in Stock yet" + hint; ready -> list; filter without hits -> "Nothing in Stock matches". Held data wins: offline with cached rows is `ready` (the shell banner says offline); a failed background refetch with rows stays `ready`. Empty is never inferred from a failed request. `useStockTotals`, `useSpoiledLots` and `useStockLots` all return `status` and `refetch`.
- A failed change: error Toast "That did not save. Try again." (replaces the inline `role=alert` paragraph).

## Folded-in QA fixes
- `AddLotSheet`: native `<select>` -> `IngredientSelect`; `type=date` -> `DateField` ("Bought on", optional); Quantity `TextField` (`inputMode=decimal`, Base Unit as `suffix`, error via the field's `error`); Save in the sheet `footer`.
- `SetTotalSheet`: same field pattern. **Decision:** `TextField` + existing `parseAmount`, not `NumberField` (commit-based, clamps, silently reverts bad text, which would swallow the "Enter a number" / negative errors the spec wants shown).
- **Dark spoil glare:** `SpoiledTile`/`ShortfallNotice` were legacy `tone="spoil"`. Now `Tile variant="status" status="spoil"`: `--status-spoil-bg` / `--status-spoil-fg` only; `--status-spoil-solid` is never a surface. Buttons inside must stay legible on that bg; the Developer checks dark contrast by screenshot.
- Spoiled tile per 2.6: overline "Throw out or keep?" with icon `spoiled`; per lot `Button size="sm"`: Throw out = `danger-tertiary` + icon `throwOut` (Trash), Keep = `secondary` + icon `tick` (Check).
- Legacy props gone from the folder: `Chip tone`, `Tile tone/size/onClick`, `Button tonal/ghost`. The folder has no CSS file of its own to keep; unused `stock-*` class names go with the rewrite (tokens only).
- `lib/filter.ts` (pure): `filterTotals`, `goOffPhrase` (en-GB weekday for 2..6 days, "16 Nov" beyond), `rowMeta`, `isDue`. `lib/status.ts`: `resolveStockStatus`. `hooks/useStockTakeEntry.ts`: `STOCK_TAKE_PATH = '/scan?mode=stocktake'`.

## Tests (red until implemented)
`lib/status`, `lib/filter`, `hooks/useStockStatus` (offline via `navigator.onLine`), `components/{StockRow,SpoiledTile,LotList,AddLotSheet,SetTotalSheet,ShortfallNotice}`, `screens/StockScreen`, `hygiene.test.ts` (no native controls, legacy props, colour literals, `-solid` surface, Phosphor imports or `StockTile` left in the folder). The old `useSpoiledLots`/`useStock` tests are unchanged and stay green.

## Developer notes
- Append `web/src/features/stock` to every `fail_paths` line in `scripts/check-ui.rules`.
- `ListRow` needs a meta colour (see request below); until it lands render the meta as the plain string.
- The Stock-take button needs the Scan screen to honour `?mode=stocktake` (see request below).

## Review round 1 additions (Designer)
- **Throw out in the lot sheet (5.7).** `LotList` takes optional `onThrowOut(lotId)`; a `Button size="sm" variant="danger-tertiary" icon="throwOut"` (name "Throw out <name>") is the row's action **only when `lot.spoiled`** (PM ruling: Throw out is for spoiled lots only, spec 6 / API). No handler, no button. `StockScreen` wires it to a new `useStockActions().throwOut(lotId)` (invalidates `['stock']`); a failure shows the "That did not save. Try again." Toast.
- **SpoiledTile** is `Tile variant="status" status="danger"` (3.1), icon stays `spoiled` (WarningCircle).
- **`lib/display.ts`** (pure): `formatLotDate('2026-11-05')` -> "5 Nov" (en-GB, no time-zone shift); `capitalise('chicken thighs')` -> "Chicken thighs" (first letter only, display only). LotList meta = `Bought 5 Nov · Scanned`; `StockRow` title and `SpoiledTile` name are capitalised; accessible button names ("Throw out chicken thighs") keep the stored name. Stored data is never changed.
- **Sheet field stack.** `AddLotSheet` and `SetTotalSheet` wrap their fields in `<div className="stock-sheet__fields">` with `display: grid; gap: var(--space-3)` in `stock.css`.
- **Single space around the dot.** Rendered `.list-row__meta` text has no run of whitespace (`'1 Stock Lot · goes off Thu'`, `'Bought 5 Nov · Scanned'`).
- `AddLotSheet` date test pins the clock (`vi.useFakeTimers({ shouldAdvanceTime: true })`, system time 2026-11-10) and asserts `purchased: '2026-11-07'`.

## Review round 2 (spoiled lot row at 390 px, sheet title)

- **Throw out in the lot sheet is icon-only.** The 268 px actions block left a 38 px text column in the fixed 64 px `ListRow`. In `LotList` the row action becomes `IconButton icon="throwOut" label="Throw out <lot.ingredientName> lot"` (stored name, e.g. "Throw out chicken thighs lot"), placed after the state chip inside `.lot-list__actions`, only when `lot.spoiled && onThrowOut`. No text `Button` remains in `LotList`. The row keeps 64 px. The `SpoiledTile` buttons are unchanged (text `Button`s, they have room).
- **CSS contract:** `.lot-list__actions { display:flex; align-items:center; flex-shrink:0; gap:var(--space-2) }`, no `flex-wrap`. Chip plus 44 px hit area is at most about 120 px, leaving the text column wide enough for amount and meta.
- **Sheet title** uses `capitalise(selected.name)` ("Chicken thighs"), like `StockRow`; the stored name is untouched.
- Tests: `LotList.test` (IconButton, name, no text, in chip container), `StockScreen.test` (button name, capitalised dialog title), `hygiene.test` (CSS contract, no `<Button` in LotList). jsdom has no layout, so the 120 px bound is the CSS contract plus a manual 390 px screenshot check by the Developer.
