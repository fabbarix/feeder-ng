import { prefersReducedMotion } from '../../../lib/motion'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'
import type { ShoppingSummary } from '../types'

export interface CelebrationTileProps {
  summary: ShoppingSummary
  currency: string
}

/**
 * "Shopping list complete": a soft Tile with a celebration icon, the Line count, the money spent (only when some was)
 * and the Stock Lots added. The celebration animation is a data attribute set only when the User does not prefer reduced motion.
 */
export function CelebrationTile({ summary, currency }: CelebrationTileProps) {
  const celebrate = !prefersReducedMotion()
  return (
    <Tile as="section" variant="soft" role="status" className="celebration-tile" {...(celebrate ? { 'data-celebrate': '' } : {})}>
      <Icon name="celebration" size={24} weight="duotone" />
      <h2 className="celebration-tile__title">{shopStrings.celebrationTitle}</h2>
      <ul className="celebration-tile__facts">
        <li>{shopStrings.celebrationLines(summary.lines)}</li>
        {summary.spentCents > 0 ? <li>{shopStrings.celebrationSpent(formatMinor(summary.spentCents, currency))}</li> : null}
        <li>{shopStrings.celebrationLots(summary.lotsAdded)}</li>
      </ul>
    </Tile>
  )
}
