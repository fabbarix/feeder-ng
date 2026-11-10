import type { ReactElement } from 'react'
import { Button, Tile } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { describeGoOff } from '../lib/view'
import type { StockLot } from '../types'
import { stockStrings as strings } from '../strings'

export interface SpoiledTileProps {
  lots: StockLot[]
  today: string
  onThrowOut: (lotId: number) => void
  onKeep: (lotId: number) => void
  system?: UnitSystem
}

/**
 * "Throw out or keep?" for spoiled Stock Lots: `Tile variant="status" status="spoil" as="section"` (so
 * bg/fg are --status-spoil-bg/-fg in both schemes; no `tone`, no `--status-spoil-solid` as a surface, which is
 * what glared in dark) with an `overline` "Throw out or keep?" + overlineIcon `spoiled`. One row per lot:
 * name, amount, go-off wording, then two icon+label `Button size="sm"`s: Throw out = variant `danger-tertiary`
 * icon `throwOut` (Trash), Keep = variant `secondary` icon `tick` (Check). Accessible names stay
 * "Throw out <name>" / "Keep <name>". Renders nothing when lots is empty. Exported for the Today screen.
 * Legacy Tile `tone`, Button `tonal`/`ghost` are gone.
 */
export function SpoiledTile({ lots, today, onThrowOut, onKeep, system = 'metric' }: SpoiledTileProps): ReactElement | null {
  if (lots.length === 0) return null
  return (
    <Tile as="section" variant="status" status="spoil" aria-label={strings.spoiledHeading}>
      <h2 className="spoiled-tile__title">{strings.spoiledHeading}</h2>
      <ul className="spoiled-tile__list">
        {lots.map((lot) => (
          <li key={lot.id} className="spoiled-tile__row">
            <span className="spoiled-tile__name">{lot.ingredientName}</span>
            <span className="spoiled-tile__amount">{formatQuantity(lot.quantity, lot.baseUnit, system)}</span>
            <span className="spoiled-tile__when">{describeGoOff(lot, today).label}</span>
            <Button variant="danger-tertiary" icon="throwOut" size="sm" aria-label={strings.throwOutLabel(lot.ingredientName)} onClick={() => onThrowOut(lot.id)}>
              {strings.throwOut}
            </Button>
            <Button variant="secondary" icon="tick" size="sm" aria-label={strings.keepLabel(lot.ingredientName)} onClick={() => onKeep(lot.id)}>
              {strings.keep}
            </Button>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
