import type { ReactElement } from 'react'
import { ListRow, Thumb } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise } from '../lib/display'
import { describeGoOff } from '../lib/view'
import type { StockLot } from '../types'

export interface PantryLotRowProps {
  lot: StockLot
  today: string
  system?: UnitSystem
  /** The Storage Place's name, shown on the right when the list is not grouped by place. */
  placeName?: string
  onOpen: (lot: StockLot) => void
}

/** One Stock Lot of the Pantry list: the Ingredient's Picture and name, "500 g · Good until Thu" (spoil colour when due), and its place. */
export function PantryLotRow({ lot, today, system = 'metric', placeName, onOpen }: PantryLotRowProps): ReactElement {
  const goOff = describeGoOff(lot, today)
  return (
    <ListRow
      title={capitalise(lot.ingredientName)}
      meta={`${formatQuantity(lot.quantity, lot.baseUnit, system)} · ${goOff.label}`}
      metaStatus={goOff.tone === 'spoil' ? 'spoil' : undefined}
      trailing={placeName}
      leading={<Thumb imageUrl={lot.ingredientImageUrl} size={40} />}
      chevron
      onActivate={() => onOpen(lot)}
    />
  )
}
