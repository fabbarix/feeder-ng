/**
 * The Stock screen behind the avatar menu. A BentoGrid of StockTile (use-soon first),
 * the SpoiledTile on top when there are spoiled lots, an "Add to Stock" button
 * (AddLotSheet), and a BottomSheet per Ingredient with LotList and "Set total"
 * (SetTotalSheet). EmptyState "Nothing in Stock yet" when there is nothing.
 * All data and actions come from the hooks in ../hooks.
 */
import type { ReactElement } from 'react'

export function StockScreen(): ReactElement | null {
  throw new Error('TODO')
}
