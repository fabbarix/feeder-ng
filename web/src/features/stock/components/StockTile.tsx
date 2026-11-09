import type { ReactElement } from 'react'
import { Chip, Tile } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { IngredientStock } from '../types'
import { stockStrings as strings } from '../strings'

export interface StockTileProps {
  item: IngredientStock
  onOpen: (ingredientId: number) => void
  system?: UnitSystem
}

/**
 * One Ingredient's Stock as a Bento Tile: name, total (in the User's unit system), lot count.
 * Use-soon or spoiled: tone "spoil"; use-soon also shows a spoil-tone Chip. Clicking calls onOpen.
 */
export function StockTile({ item, onOpen, system = 'metric' }: StockTileProps): ReactElement | null {
  const attention = item.useSoon || item.spoiledCount > 0
  return (
    <Tile size={item.useSoon ? 'lg' : 'md'} tone={attention ? 'spoil' : 'neutral'} onClick={() => onOpen(item.ingredientId)}>
      <span className="stock-tile__name">{item.name}</span>
      <span className="stock-tile__total">{formatQuantity(item.total, item.baseUnit, system)}</span>
      <span className="stock-tile__lots">{strings.lotCount(item.lotCount)}</span>
      {item.useSoon ? <Chip tone="spoil">{strings.useSoon}</Chip> : null}
    </Tile>
  )
}
