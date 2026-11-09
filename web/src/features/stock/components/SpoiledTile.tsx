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
 * "Throw out or keep?" for spoiled Stock Lots, in the fixed spoil colour. Each row
 * shows name, amount and go-off wording, with "Throw out" and "Keep" buttons
 * (accessible names "Throw out <name>" / "Keep <name>"). Renders nothing when lots is empty.
 * Exported for the Today screen to embed.
 */
export function SpoiledTile({ lots, today, onThrowOut, onKeep, system = 'metric' }: SpoiledTileProps): ReactElement | null {
  if (lots.length === 0) return null
  return (
    <Tile as="section" tone="spoil" aria-label={strings.spoiledHeading}>
      <h2 className="spoiled-tile__title">{strings.spoiledHeading}</h2>
      <ul className="spoiled-tile__list">
        {lots.map((lot) => (
          <li key={lot.id} className="spoiled-tile__row">
            <span className="spoiled-tile__name">{lot.ingredientName}</span>
            <span className="spoiled-tile__amount">{formatQuantity(lot.quantity, lot.baseUnit, system)}</span>
            <span className="spoiled-tile__when">{describeGoOff(lot, today).label}</span>
            <Button variant="tonal" size="md" aria-label={strings.throwOutLabel(lot.ingredientName)} onClick={() => onThrowOut(lot.id)}>
              {strings.throwOut}
            </Button>
            <Button variant="ghost" size="md" aria-label={strings.keepLabel(lot.ingredientName)} onClick={() => onKeep(lot.id)}>
              {strings.keep}
            </Button>
          </li>
        ))}
      </ul>
    </Tile>
  )
}
