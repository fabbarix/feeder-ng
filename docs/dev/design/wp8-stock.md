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
