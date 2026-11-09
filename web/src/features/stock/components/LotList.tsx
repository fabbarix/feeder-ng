import type { ReactElement } from 'react'
import type { StockLot } from '../types'

export interface LotListProps {
  lots: StockLot[]
  today: string
}

/** Lot detail rows: amount, bought-on date, go-off wording (describeGoOff, spoil tone Chip when it says so), source. */
export function LotList(props: LotListProps): ReactElement | null {
  void props
  throw new Error('TODO')
}
