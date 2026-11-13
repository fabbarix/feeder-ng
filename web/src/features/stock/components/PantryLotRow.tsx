import type { ReactElement } from 'react'
import { ListRow, Thumb } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise } from '../lib/display'
import { isBelowRestock, isSupply, supplyLotMeta, type Restock } from '../lib/supplies'
import { describeGoOff } from '../lib/view'
import type { StockLot } from '../types'

export interface PantryLotRowProps {
  lot: StockLot
  today: string
  system?: UnitSystem
  /** The Storage Place's name, shown on the right when the list is not grouped by place. */
  placeName?: string
  /** H6: a Supply's Restock level and Stock; a Supply below it is marked info. Food ignores it. */
  restock?: Restock | null
  onOpen: (lot: StockLot) => void
}

/**
 * One Stock Lot of the Pantry list: the Ingredient's Picture and name, and its meta. Food: "500 g · Good until Thu" (spoil colour when
 * due). A Supply: "4 pieces · restocks below 6" (info colour below its Restock level), never a go-off date or a spoil tone.
 */
export function PantryLotRow({ lot, today, system = 'metric', placeName, restock = null, onOpen }: PantryLotRowProps): ReactElement {
  if (isSupply(lot)) {
    return (
      <ListRow
        title={capitalise(lot.ingredientName)}
        meta={supplyLotMeta(lot, restock, system)}
        metaStatus={isBelowRestock(restock) ? 'info' : undefined}
        trailing={placeName}
        leading={<Thumb name={lot.ingredientName} imageUrl={lot.ingredientImageUrl} size={40} />}
        chevron
        onActivate={() => onOpen(lot)}
      />
    )
  }
  const goOff = describeGoOff(lot, today)
  return (
    <ListRow
      title={capitalise(lot.ingredientName)}
      meta={`${formatQuantity(lot.quantity, lot.baseUnit, system)} · ${goOff.label}`}
      metaStatus={goOff.tone === 'spoil' ? 'spoil' : undefined}
      trailing={placeName}
      leading={<Thumb name={lot.ingredientName} imageUrl={lot.ingredientImageUrl} size={40} />}
      chevron
      onActivate={() => onOpen(lot)}
    />
  )
}
