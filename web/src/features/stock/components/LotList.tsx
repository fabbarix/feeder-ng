import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { StockLot } from '../types'

export interface LotListProps {
  lots: StockLot[]
  today: string
  system?: UnitSystem
}

/**
 * Lot detail as a `ListGroup label="Stock Lots"` of `ListRow`s (separators come from the group): title = amount
 * (formatQuantity), meta = "Bought <purchased> · <source label>", trailing = go-off wording as
 * `Chip kind="state" status="spoil"` when describeGoOff says spoil, else a plain `Chip kind="tag"`.
 * No more `data-tone`; the chip's `data-status` carries the colour.
 */
export function LotList(_props: LotListProps): ReactElement | null {
  throw new Error('not implemented')
}
