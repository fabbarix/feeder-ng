import { prefersReducedMotion } from '../../../lib/motion'
import { Tile } from '../../../ui/Tile'
import { formatMinor } from '../../products/lib/money'
import { shopStrings } from '../strings'
import type { ShoppingSummary } from '../types'

export interface CelebrationTileProps {
  summary: ShoppingSummary
  currency: string
}

/**
 * "Shopping list complete": an accent Tile with the heading, the Line count, the money spent and the Stock Lots added.
 * The celebration animation is a data attribute set only when the User does not prefer reduced motion.
 */
export function CelebrationTile({ summary, currency }: CelebrationTileProps) {
  const celebrate = !prefersReducedMotion()
  return (
    <Tile
      as="section"
      tone="accent"
      role="status"
      className="celebration-tile"
      {...(celebrate ? { 'data-celebrate': '' } : {})}
    >
      <h2 className="celebration-tile__title">{shopStrings.celebrationTitle}</h2>
      <ul className="celebration-tile__facts">
        <li>{shopStrings.celebrationLines(summary.lines)}</li>
        <li>{shopStrings.celebrationSpent(formatMinor(summary.spentCents, currency))}</li>
        <li>{shopStrings.celebrationLots(summary.lotsAdded)}</li>
      </ul>
    </Tile>
  )
}
