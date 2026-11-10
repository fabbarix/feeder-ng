import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'

export interface CostTileProps {
  /** sum of the priced, unticked Lines */
  estimatedCostCents: number
  /** Lines with no Price ("—") */
  unpriced: number
  currency: string
  /** the Shop the list is priced at; null = none picked ("est.") */
  shopName?: string | null
  /** opens the Scan screen */
  onScan?: () => void
}

/** The estimated estimatedCost: the amount, or "—" when nothing is priced yet, and how many Lines have no Price. */
export function CostTile({ estimatedCostCents, unpriced, currency }: CostTileProps) {
  const nothingPriced = estimatedCostCents === 0 && unpriced > 0
  return (
    <Tile size="sm" className="cost-tile">
      <p className="cost-tile__label">{shopStrings.estimatedCost}</p>
      <span className="cost-tile__value">{nothingPriced ? shopStrings.noPrice : formatMinor(estimatedCostCents, currency)}</span>
      {unpriced > 0 ? <p className="cost-tile__unpriced">{shopStrings.unpriced(unpriced)}</p> : null}
    </Tile>
  )
}
