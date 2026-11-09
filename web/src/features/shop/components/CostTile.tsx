import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'

export interface CostTileProps {
  /** sum of the priced, unticked Lines */
  costCents: number
  /** Lines with no Price ("—") */
  unpriced: number
  currency: string
}

/** The estimated cost: the amount, or "—" when nothing is priced yet, and how many Lines have no Price. */
export function CostTile({ costCents, unpriced, currency }: CostTileProps) {
  const nothingPriced = costCents === 0 && unpriced > 0
  return (
    <Tile size="sm" className="cost-tile">
      <p className="cost-tile__label">{shopStrings.cost}</p>
      <span className="cost-tile__value">{nothingPriced ? shopStrings.noPrice : formatMinor(costCents, currency)}</span>
      {unpriced > 0 ? <p className="cost-tile__unpriced">{shopStrings.unpriced(unpriced)}</p> : null}
    </Tile>
  )
}
