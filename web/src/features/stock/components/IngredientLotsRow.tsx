import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { IngredientStock, StockLot, StoragePlace } from '../types'

export interface IngredientLotsRowProps {
  item: IngredientStock
  /** This Ingredient's Lots, in any order; the row shows them in Deduction order. */
  lots: StockLot[]
  places: StoragePlace[]
  today: string
  system?: UnitSystem
  expanded: boolean
  onToggle: () => void
  /** A Lot was tapped: the screen opens the Lot sheet. */
  onOpenLot: (lot: StockLot) => void
}

/**
 * One By Ingredient row that expands in place (ListRow `expanded` / `onToggle` / `panel`, Q21): title = the Ingredient,
 * trailing = its total, meta as StockRow, the target named "<Name>, 2 Stock Lots" with aria-expanded; the panel is a
 * list "<Name> Stock Lots" of one ListRow per Lot (title = quantity, meta = lotMeta), each a button that calls onOpenLot.
 */
export function IngredientLotsRow(props: IngredientLotsRowProps): ReactElement | null {
  void props
  return null
}
