import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { IngredientStock } from '../types'

export interface StockRowProps {
  item: IngredientStock
  today: string
  onOpen: (ingredientId: number) => void
  system?: UnitSystem
}

/**
 * One Ingredient as a `ListRow` (replaces the old tile): title = name, trailing = total (formatQuantity, tabular),
 * meta = rowMeta(item, today), chevron, `onActivate` -> onOpen(ingredientId). When isDue(item) the meta is drawn
 * in the spoil colour with an HourglassMedium 14 (needs the ListRow `metaStatus` request, see the design note).
 * No tile, no Chip: "Use soon" is the meta, not a pill.
 */
export function StockRow(_props: StockRowProps): ReactElement | null {
  throw new Error('not implemented')
}
