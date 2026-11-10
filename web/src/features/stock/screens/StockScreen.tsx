/**
 * The Stock screen, reached from the avatar menu (a top-level destination: the bars stay, so no back button).
 *
 * Layout (ui-fix-plan 2.6, 5.7), top to bottom:
 * - `PageHeader title="Stock"` with actions: secondary sm "Stock-take" (icon `scan`/Barcode, onClick from
 *   useStockTakeEntry) and primary sm "Add to Stock" (icon `add`) which opens AddLotSheet. Header actions are the
 *   only Buttons at this level, so one primary per scope.
 * - SpoiledTile (when there are spoiled lots).
 * - `SearchField` "Search Stock" and filter `Chip kind="filter"`s All · Use soon · Spoiled (aria-pressed), both
 *   only when status is 'ready'. filterTotals(sortTotals(data), filter, query).
 * - A `ListGroup label="Stock"` of StockRow. If the filter leaves nothing: EmptyState "Nothing in Stock matches".
 * - A BottomSheet per Ingredient: LotList + secondary "Set total" (-> SetTotalSheet).
 * Status (from useStockTotals().status): loading -> `Skeleton variant="row" count={5}`; error -> `ErrorState`
 * "Stock could not be loaded." with onRetry = refetch; offline -> `EmptyState` "Stock is not saved on this device
 * yet" (icon `offline`); empty -> `EmptyState` "Nothing in Stock yet" + hint + action; ready -> the list.
 * A failed change shows a `useToast` error toast "That did not save. Try again." (no inline role=alert paragraph).
 * No `<main>`: the shell provides it. No tile grid.
 */
import type { ReactElement } from 'react'

export function StockScreen(): ReactElement | null {
  throw new Error('not implemented')
}
