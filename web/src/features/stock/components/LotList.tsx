import type { ReactElement } from 'react'
import { Chip } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../lib/view'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'

export interface LotListProps {
  lots: StockLot[]
  today: string
  system?: UnitSystem
}

/** Lot detail rows: amount, bought-on date, go-off wording (spoil tone Chip when it says so), source. */
export function LotList({ lots, today, system = 'metric' }: LotListProps): ReactElement | null {
  return (
    <ul className="lot-list">
      {lots.map((lot) => {
        const go = describeGoOff(lot.goesOff, today)
        return (
          <li key={lot.id} className="lot-list__row">
            <span className="lot-list__amount">{formatQuantity(lot.quantity, lot.baseUnit, system)}</span>
            <span className="lot-list__bought">
              {strings.purchased} {lot.purchased}
            </span>
            <Chip tone={go.tone}>{go.label}</Chip>
            <span className="lot-list__source">{strings.source[lot.source]}</span>
          </li>
        )
      })}
    </ul>
  )
}
