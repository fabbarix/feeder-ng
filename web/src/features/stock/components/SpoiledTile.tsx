import type { ReactElement } from 'react'
import { Button, ListRow, Tile, useMediaQuery } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../lib/view'
import { capitalise } from '../lib/display'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'
import '../stock.css'

export interface SpoiledTileProps {
  lots: StockLot[]
  today: string
  onThrowOut: (lotId: number) => void
  onKeep: (lotId: number) => void
  system?: UnitSystem
  /** Keep the actions under the text even from 820 px (a narrow column, like Stock's aside). */
  stacked?: boolean
}

/**
 * "Throw out or keep?" for spoiled Stock Lots: `Tile variant="status" status="danger" as="section"` (bg/fg are
 * --status-danger-bg/-fg in both schemes), with
 * the overline "Throw out or keep?" and the `spoiled` icon. One row per lot, with two
 * icon + label `Button size="sm"`s: Throw out = danger-tertiary with `throwOut` (Trash), Keep = secondary with `tick`
 * (Check). L-07: each lot is a `ListRow` (title = name, meta = "amount · go-off wording"); from 820 px the two buttons
 * trail the row, below it they sit under the text. Accessible names stay "Throw out <name>" / "Keep <name>". Renders nothing when lots is empty.
 * Exported for the Today screen.
 */
export function SpoiledTile({ lots, today, onThrowOut, onKeep, system = 'metric', stacked = false }: SpoiledTileProps): ReactElement | null {
  const wide = useMediaQuery('(min-width: 820px)') && !stacked
  if (lots.length === 0) return null
  return (
    <Tile as="section" variant="status" status="danger" span="full" aria-label={strings.spoiledHeading} overline={strings.spoiledHeading} overlineIcon="spoiled">
      <ul className="spoiled-tile__list">
        {lots.map((lot) => {
          const actions = (
            <>
              <Button variant="danger-tertiary" icon="throwOut" size="sm" aria-label={strings.throwOutLabel(lot.ingredientName)} onClick={() => onThrowOut(lot.id)}>
                {strings.throwOut}
              </Button>
              <Button variant="secondary" icon="tick" size="sm" aria-label={strings.keepLabel(lot.ingredientName)} onClick={() => onKeep(lot.id)}>
                {strings.keep}
              </Button>
            </>
          )
          const title = capitalise(lot.ingredientName)
          const meta = `${formatQuantity(lot.quantity, lot.baseUnit, system)} · ${describeGoOff(lot, today).label}`
          // From 820 px the actions trail the row; on a phone they go under the text (the row grows).
          return wide ? (
            <ListRow key={lot.id} title={title} meta={meta} trailing={actions} />
          ) : (
            <ListRow key={lot.id} title={title} meta={meta}>
              {actions}
            </ListRow>
          )
        })}
      </ul>
    </Tile>
  )
}
