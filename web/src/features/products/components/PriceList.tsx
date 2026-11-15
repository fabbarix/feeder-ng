import { ListGroup, ListRow } from '../../../ui'
import type { PriceRow } from '../lib/priceRows'
import type { Price } from '../types'
import '../products.css'

export interface PriceListProps {
  rows: PriceRow[]
  /** Names the list for a screen reader. */
  label: string
  /** Opens the Price sheet of a row. */
  onOpen: (price: Price) => void
}

/** SET-04: R-E Price rows (priceRows): the Shop as title, the date as meta, the price in the value column; a row opens its Price sheet. */
export function PriceList({ rows, label, onOpen }: PriceListProps) {
  return (
    <ListGroup label={label}>
      {rows.map((r) => (
        <ListRow
          key={r.id}
          title={r.key}
          aria-label={r.label}
          meta={r.detail}
          value={r.value}
          subValue={r.subValue}
          chevron
          haspopup="dialog"
          onActivate={() => onOpen(r.price)}
        />
      ))}
    </ListGroup>
  )
}
