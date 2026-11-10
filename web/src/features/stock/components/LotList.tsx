import type { ReactElement } from 'react'
import { Button, Chip, ListGroup, ListRow } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { formatLotDate } from '../lib/display'
import { describeGoOff } from '../lib/view'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'
import '../stock.css'

export interface LotListProps {
  lots: StockLot[]
  today: string
  system?: UnitSystem
  /** Shown on spoiled lots only: "Throw out" for that lot. */
  onThrowOut?: (lotId: number) => void
}

/**
 * Lot detail as a `ListGroup label="Stock Lots"` of `ListRow`s (separators come from the group): title = amount
 * (formatQuantity), meta = "Bought <purchased, en-GB day and month> · <source label>", trailing = go-off wording as
 * `Chip kind="state" status="spoil"` when describeGoOff says spoil, else a plain `Chip kind="tag"`. A spoiled lot
 * also gets a `Button variant="danger-tertiary"` "Throw out" when `onThrowOut` is given.
 */
export function LotList({ lots, today, system = 'metric', onThrowOut }: LotListProps): ReactElement | null {
  return (
    <ListGroup label={strings.lots}>
      {lots.map((lot) => {
        const go = describeGoOff(lot, today)
        return (
          <ListRow
            key={lot.id}
            title={formatQuantity(lot.quantity, lot.baseUnit, system)}
            meta={`${strings.boughtOn(formatLotDate(lot.purchased))} · ${strings.source[lot.source]}`}
            trailing={
              <span className="lot-list__actions">
                {go.tone === 'spoil' ? (
                  <Chip kind="state" status="spoil">
                    {go.label}
                  </Chip>
                ) : (
                  <Chip kind="tag">{go.label}</Chip>
                )}
                {lot.spoiled && onThrowOut ? (
                  <Button variant="danger-tertiary" icon="throwOut" size="sm" onClick={() => onThrowOut(lot.id)}>
                    {strings.throwOut}
                  </Button>
                ) : null}
              </span>
            }
          />
        )
      })}
    </ListGroup>
  )
}
