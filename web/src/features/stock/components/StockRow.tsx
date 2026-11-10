import type { ReactElement } from 'react'
import { ListRow } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { rowMeta } from '../lib/filter'
import type { IngredientStock } from '../types'

export interface StockRowProps {
  item: IngredientStock
  today: string
  onOpen: (ingredientId: number) => void
  system?: UnitSystem
}

/**
 * One Ingredient as a `ListRow` (replaces the old tile): title = name, trailing = total (formatQuantity, tabular),
 * meta = rowMeta(item, today), chevron, `onActivate` -> onOpen(ingredientId). No tile, no Chip: "Use soon" is the meta,
 * not a pill.
 * TODO(WP3b): when isDue(item) the meta should be drawn in the spoil colour with HourglassMedium 14. ListRow has no
 * `metaStatus` yet (a primitive follow-up team is adding it), so the meta is plain text for now.
 */
export function StockRow({ item, today, onOpen, system = 'metric' }: StockRowProps): ReactElement | null {
  return (
    <ListRow
      title={item.name}
      meta={rowMeta(item, today)}
      trailing={formatQuantity(item.total, item.baseUnit, system)}
      chevron
      onActivate={() => onOpen(item.ingredientId)}
    />
  )
}
