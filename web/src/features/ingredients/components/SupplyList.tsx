import { IconButton, ListGroup, ListRow, Thumb } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { rowMeta } from '../lib/kind'
import { displayName } from '../lib/names'
import { canUse, stockLevel, useLabel } from '../lib/supplyUse'
import { strings } from '../strings'
import type { Ingredient } from '../types'
import '../ingredients.css'

export interface SupplyListProps {
  supplies: readonly Ingredient[]
  /** Stock per Supply id in Base Units; null until Stock has loaded (the rows keep their old meta and every Use is disabled). */
  stock: ReadonlyMap<number, number> | null
  system: UnitSystem
  onOpen: (id: number) => void
  /** The Use button of a row: the Supply, never the row's own target. */
  onUse: (supply: Ingredient) => void
  /** The Supply whose Use is in flight: its button is disabled. */
  busyId?: number | null
  /** The list's name; the Supplies title by default. */
  label?: string
}

/** The Supplies as a ListGroup of ListRows: the stock level in the meta (info tone below the Restock level), and a Use button beside the chevron. */
export function SupplyList({ supplies, stock, system, onOpen, onUse, busyId = null, label = strings.supply.title }: SupplyListProps) {
  return (
    <ListGroup label={label}>
      {supplies.map((supply) => {
        const total = stock === null ? null : (stock.get(supply.id) ?? 0)
        const level = total === null ? null : stockLevel(total, supply.restockLevel ?? null, supply.baseUnit, system)
        return (
          <ListRow
            key={supply.id}
            title={displayName(supply.name)}
            meta={level ? level.text : rowMeta(supply, system)}
            metaStatus={level?.below ? 'info' : undefined}
            leading={<Thumb name={supply.name} imageUrl={supply.imageUrl} size={40} />}
            chevron
            trailing={
              <IconButton
                icon="use"
                label={useLabel(supply.name, supply.baseUnit)}
                disabled={total === null || !canUse(total) || busyId === supply.id}
                onClick={() => onUse(supply)}
              />
            }
            onActivate={() => onOpen(supply.id)}
          />
        )
      })}
    </ListGroup>
  )
}
