import type { ReactElement } from 'react'
import { ListRow, Thumb } from '../../../ui'
import { restockReason } from '../../../lib/restock'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise } from '../lib/display'
import { isBelowRestock, isSupply, type Restock } from '../lib/supplies'
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
 * One Stock Lot of the Pantry list (SSP-05): the Ingredient's Picture and name, the quantity in the value column, and the status
 * alone as meta. Food: "Good until Thu" (spoil colour when due; Went off and Use soon have their own icons). A Supply: "Restocks
 * below 6", or "Below 6 · 4 in Stock" (info) with the compact form "4 in Stock"; no meta without a Restock level. A Lot row opens a
 * sheet, so it has no chevron.
 */
export function PantryLotRow({ lot, today, system = 'metric', placeName, restock = null, onOpen }: PantryLotRowProps): ReactElement {
  const value = formatQuantity(lot.quantity, lot.baseUnit, system)
  const leading = <Thumb name={lot.ingredientName} imageUrl={lot.ingredientImageUrl} size={40} />
  if (isSupply(lot)) {
    const reason = restock ? restockReason(restock.stock, restock.level, lot.baseUnit, system, { stockInReason: false }) : null
    return (
      <ListRow
        title={capitalise(lot.ingredientName)}
        value={value}
        meta={reason ? reason.long : undefined}
        metaCompact={reason && reason.compact ? reason.compact : undefined}
        metaStatus={reason && isBelowRestock(restock) ? 'info' : undefined}
        trailing={placeName}
        leading={leading}
        haspopup="dialog"
        onActivate={() => onOpen(lot)}
      />
    )
  }
  const goOff = describeGoOff(lot, today)
  const spoil = goOff.tone === 'spoil'
  return (
    <ListRow
      title={capitalise(lot.ingredientName)}
      value={value}
      meta={goOff.label}
      metaStatus={spoil ? 'spoil' : undefined}
      metaIcon={spoil ? (lot.spoiled ? 'spoiled' : 'useSoon') : undefined}
      trailing={placeName}
      leading={leading}
      haspopup="dialog"
      onActivate={() => onOpen(lot)}
    />
  )
}
