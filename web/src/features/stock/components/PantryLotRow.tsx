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
  /**
   * The Storage Place's name, when the list is not grouped by place. It follows the status in the meta ("Good until Thu · Kitchen
   * Pantry"); the value column keeps the quantity, and under 12 rem of text the compact meta is the status alone.
   */
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
        meta={withPlace(reason?.long, placeName)}
        metaCompact={placeName ? reason?.compact || reason?.long || undefined : reason?.compact || undefined}
        metaStatus={reason && isBelowRestock(restock) ? 'info' : undefined}
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
      meta={withPlace(goOff.label, placeName)}
      metaCompact={placeName ? goOff.label : undefined}
      metaStatus={spoil ? 'spoil' : undefined}
      metaIcon={spoil ? (lot.spoiled ? 'spoiled' : 'useSoon') : undefined}
      leading={leading}
      haspopup="dialog"
      onActivate={() => onOpen(lot)}
    />
  )
}

/** The meta of an ungrouped row: the status first, then the Storage Place; either alone when the other is missing. */
function withPlace(status: string | undefined, placeName: string | undefined): string | undefined {
  const parts = [status, placeName].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : undefined
}
