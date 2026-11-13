import type { ReactElement } from 'react'
import { ListGroup, ListRow, Thumb } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { deductionOrder, lotMeta } from '../lib/ingredientLots'
import { rowMeta } from '../lib/filter'
import { capitalise } from '../lib/display'
import { isBelowRestock, isSupply, supplyLotLineMeta, supplyRowMeta, type Restock } from '../lib/supplies'
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
  return (
    <ListRow
      title={name}
      aria-label={strings.ingredientLotsLabel(name, lots.length)}
      meta={supply ? supplyRowMeta(item, restock, system) : rowMeta(item, today)}
      metaStatus={supply && isBelowRestock(restock) ? 'info' : undefined}
      trailing={formatQuantity(item.total, item.baseUnit, system)}
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
                title={formatQuantity(lot.quantity, lot.baseUnit, system)}
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
