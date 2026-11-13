import { Button } from '../../../ui/Button'
import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'

export interface CostTileProps {
  /** sum of the priced, unticked Lines, in minor units */
  estimatedCostCents: number
  /** Lines with no Price */
  unpriced: number
  currency: string
  /** the Shop the list is priced at; null = none picked ("est.") */
  shopName?: string | null
  /** opens the Scan screen */
  onScan?: () => void
}

/**
 * The estimated total: "$13.50" and "est. at Coop" once something is priced, how many Lines have no Price, and a Scan
 * button. Nothing is shown in place of the amount when nothing is priced (no "$0.00", no dash).
 */
export function CostTile({ estimatedCostCents, unpriced, currency, shopName, onScan }: CostTileProps) {
  const priced = estimatedCostCents > 0
  return (
    <Tile className="cost-tile">
      {priced ? (
        <>
          <p className="cost-tile__label">{shopStrings.estimatedTotal}</p>
          <span className="cost-tile__value">{formatMinor(estimatedCostCents, currency)}</span>
          <p className="cost-tile__caption">{shopName ? shopStrings.estimatedAt(shopName) : shopStrings.estimatedAnyShop}</p>
        </>
      ) : null}
      {unpriced > 0 ? <p className="cost-tile__unpriced">{shopStrings.unpriced(unpriced)}</p> : null}
      {onScan ? (
        <Button variant="accent-secondary" size="sm" icon="scan" onClick={onScan}>
          {shopStrings.scan}
        </Button>
      ) : null}
    </Tile>
  )
}
