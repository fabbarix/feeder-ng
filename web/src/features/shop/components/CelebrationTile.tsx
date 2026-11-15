// B9-43 (SSP-09; mocks/ssp-09-complete.html): "Shopping List complete" is a success status tile (bordered): its summary is three R-E rows
// on the success tint (a DetailList named "This shop"), then one primary at most: "Put away 17 Stock Lots" while some of this list's Stock
// Lots are Not sorted, else "Read the receipt" (a Scan session today and the assistant available), else no button. When both apply, Read
// the receipt is the outlined secondary after Put away. The celebration animation is a data attribute set only without reduced motion.
// Scan's empty To get shows the same tile.
import { prefersReducedMotion } from '../../../lib/motion'
import { Button } from '../../../ui/Button'
import { DetailList, DetailRow } from '../../../ui/DetailList'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'
import type { ShoppingSummary } from '../types'

export interface CelebrationTileProps {
  summary: ShoppingSummary
  currency: string
  /** B9-43 (SSP-09): the Shop the list is priced at ("Spent at Coop"); null for Any Shop ("Spent") */
  shopName?: string | null
  /** B9-43: how many of this list's Stock Lots are Not sorted (hooks/useUnsortedFromList); 0 or absent = none */
  unsorted?: number
  /** B9-43: this phone has a Scan session and the Recipe Assistant can read a receipt */
  canReadReceipt?: boolean
  onPutAway?: () => void
  onReadReceipt?: () => void
}

export function CelebrationTile({ summary, currency, shopName = null, unsorted = 0, canReadReceipt = false, onPutAway, onReadReceipt }: CelebrationTileProps) {
  const celebrate = !prefersReducedMotion()
  const putAway = unsorted > 0 && onPutAway !== undefined
  const receipt = canReadReceipt && onReadReceipt !== undefined
  return (
    <Tile as="section" variant="status" status="success" role="status" className="celebration-tile" {...(celebrate ? { 'data-celebrate': '' } : {})}>
      <Icon name="celebration" size={24} weight="duotone" />
      <h2 className="celebration-tile__title">{shopStrings.celebrationTitle}</h2>
      <DetailList tone="success" aria-label={shopStrings.celebrationRows}>
        <DetailRow label={shopStrings.linesTicked} state={summary.lines} />
        {summary.spentCents > 0 ? (
          <DetailRow label={shopName ? shopStrings.spentAt(shopName) : shopStrings.spent} state={formatMinor(summary.spentCents, currency)} />
        ) : null}
        <DetailRow label={shopStrings.lotsAdded(summary.lotsAdded)} state={summary.lotsAdded} detail={unsorted > 0 ? shopStrings.notSortedYet(unsorted) : undefined} />
      </DetailList>
      {putAway || receipt ? (
        <div className="celebration-tile__actions">
          {putAway ? (
            <Button variant="primary" icon="moveDown" onClick={onPutAway}>
              {shopStrings.putAwayLots(unsorted)}
            </Button>
          ) : null}
          {receipt ? (
            <Button variant={putAway ? 'secondary' : 'primary'} icon="receipt" onClick={onReadReceipt}>
              {shopStrings.readReceipt}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Tile>
  )
}
