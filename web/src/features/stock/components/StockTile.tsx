import type { ReactElement } from 'react'
import type { IngredientStock } from '../types'

export interface StockTileProps {
  item: IngredientStock
  onOpen: (ingredientId: number) => void
}

/**
 * One Ingredient's Stock as a Bento Tile: name, total (formatAmount), lot count.
 * Use-soon or spoiled: tone "spoil" plus a spoil-tone Chip "Use soon". Clicking calls onOpen.
 */
export function StockTile(props: StockTileProps): ReactElement | null {
  void props
  throw new Error('TODO')
}
