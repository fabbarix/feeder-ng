// The rows of the spoiled tile (SpoiledTile): one ListRow per spoiled Stock Lot with Throw out and Keep. Split out of the tile file
// (B9-55): rows with actions, not bullet sentences. Renders and wires events only; the tile owns focus after a row leaves.
import type { ReactElement } from 'react'
import { Button, ListRow } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../lib/view'
import { capitalise } from '../lib/display'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'

export interface SpoiledLotListProps {
  lots: StockLot[]
  today: string
  system: UnitSystem
  /** Each row's Keep button by Lot id, so the tile can focus the next row's Keep. */
  keepButtons: Map<number, HTMLButtonElement>
  onThrowOut: (lot: StockLot) => void
  onKeep: (lot: StockLot) => void
}

export function SpoiledLotList({ lots, today, system, keepButtons, onThrowOut, onKeep }: SpoiledLotListProps): ReactElement {
  return (
    <ul className='spoiled-tile__list'>
      {lots.map((lot) => {
        const actions = (
          <>
            <Button
              variant='danger-secondary'
              icon='throwOut'
              size='sm'
              aria-label={strings.throwOutLabel(lot.ingredientName)}
              onClick={() => onThrowOut(lot)}
            >
              {strings.throwOut}
            </Button>
            <Button
              variant='secondary'
              icon='tick'
              size='sm'
              aria-label={strings.keepLabel(lot.ingredientName)}
              ref={(el: HTMLButtonElement | null) => {
                if (el) keepButtons.set(lot.id, el)
                else keepButtons.delete(lot.id)
              }}
              onClick={() => onKeep(lot)}
            >
              {strings.keep}
            </Button>
          </>
        )
        const title = capitalise(lot.ingredientName)
        const meta = `${describeGoOff(lot, today).label} · ${formatQuantity(lot.quantity, lot.baseUnit, system)}`
        return (
          <ListRow key={lot.id} title={title} meta={meta}>
            {actions}
          </ListRow>
        )
      })}
    </ul>
  )
}
