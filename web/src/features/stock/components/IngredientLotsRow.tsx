import type { ReactElement } from 'react'
import { ListGroup, ListRow, Quantity, Thumb } from '../../../ui'
import { spokenQuantity, type UnitSystem } from '../../../lib/units'
import { deductionOrder, lotMeta } from '../lib/ingredientLots'
import { rowMeta, rowMetaCompact } from '../lib/filter'
import { capitalise } from '../lib/display'
import { isSupply, supplyLotLineMeta, supplyRestockMeta, supplyRowMeta, type Restock } from '../lib/supplies'
import { describeGoOff } from '../lib/view'
import { stockStrings as strings } from '../strings'
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
  /** H6: a Supply's Restock level and Stock (null without a level). Food ignores it. */
  restock?: Restock | null
}

/**
 * One By Ingredient row that expands in place (ListRow `expanded` / `onToggle` / `panel`, Q21): title = the Ingredient,
 * trailing = its total, meta as StockRow, the target named "<Name>, 2 Stock Lots" with aria-expanded; the panel is a
 * list "<Name> Stock Lots" of one ListRow per Lot (title = quantity, meta = lotMeta), each a button that calls onOpenLot.
 */
export function IngredientLotsRow({ item, lots, places, today, system = 'metric', expanded, onToggle, onOpenLot, restock = null }: IngredientLotsRowProps): ReactElement | null {
  const name = capitalise(item.name)
  const supply = isSupply(item)
  // SSP-05: a narrow Supply row shows its Restock status alone ("4 in Stock" below the level, else "Restocks below 6"), never cut.
  const restockMeta = supply ? supplyRestockMeta(restock, item.baseUnit, system) : null
  return (
    <ListRow
      title={name}
      aria-label={strings.ingredientLotsLabel(name, lots.length)}
      meta={supply ? supplyRowMeta(item, restock, system) : rowMeta(item, today)}
      metaCompact={(supply ? (restockMeta ? restockMeta.compact || restockMeta.long : '') : rowMetaCompact(item, today)) || undefined}
      metaStatus={restockMeta?.below ? 'info' : undefined}
      trailing={<Quantity amount={item.total} base={item.baseUnit} system={system} />}
      leading={<Thumb name={name} imageUrl={item.imageUrl} size={40} />}
      chevron
      expanded={expanded}
      onToggle={onToggle}
      panel={
        <ListGroup label={strings.lotsOf(name)}>
          {deductionOrder(lots).map((lot) => {
            const placeName = places.find((p) => p.id === lot.storagePlaceId)?.name ?? null
            // A Supply's Lot has no go-off part, whatever a stray date or flag says.
            const meta = supply ? supplyLotLineMeta(lot, today, placeName) : lotMeta(lot, today, placeName)
            return (
              <ListRow
                key={lot.id}
                title={<Quantity amount={lot.quantity} base={lot.baseUnit} system={system} />}
                aria-label={spokenQuantity(lot.quantity, lot.baseUnit, system)}
                meta={meta}
                metaStatus={!supply && describeGoOff(lot, today).tone === 'spoil' ? 'spoil' : undefined}
                chevron
                onActivate={() => onOpenLot(lot)}
              />
            )
          })}
        </ListGroup>
      }
    />
  )
}
