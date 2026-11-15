import { useId, type ReactNode } from 'react'
import { Button, Icon } from '../../../ui'
import { cookStrings } from '../strings'

export interface CookNavTilesProps {
  isFirst: boolean
  isLast: boolean
  onBack: () => void
  onNext: () => void
  /** Present for a Planned Meal: the last Step then offers "Mark as Cooked" (T11's sheet). */
  onMarkCooked?: () => void
  /** Present for a Recipe scope: the last Step then offers "Done". */
  onDone?: () => void
  /** Why Next is held (a timer the next Step waits for is still running): Next is disabled and this line says why. */
  heldText?: string | null
  /** The label of the last-item action, default "Mark as Cooked"; the timeline passes "Mark all Cooked". */
  markLabel?: string
  /** B9-40 (PC-12): the last Step of a meal that is not due yet: why it cannot be marked Cooked (lib/future futureLine). */
  futureLine?: string
  /** B9-40 (PC-12): leaves Cook Mode (the Plan, or where the cook came from); the primary of a future meal's last Step. */
  onLeave?: () => void
  /** B9-40: the label of onLeave, default "Back to Plan" (the origin's name when the cook did not come from the Plan). */
  leaveLabel?: string
  /** B9-45 (PC-05): the label of Next, "Start cooking" on Get ready (default "Next"). */
  nextLabel?: string
  /** B9-40 (PC-03): the timer strip, first in the sticky nav (it spans both columns). */
  children?: ReactNode
}

/**
 * The sticky nav of Cook Mode: the timer strip (children), then Back (secondary, Back arrow) and the forward action (primary). Before
 * the last Step the forward action is Next (Next arrow), disabled while `heldText` says why. On the last Step it is "Mark as Cooked"
 * (onMarkCooked), "Back to Recipe" (onDone), or for a meal that is not due yet "Back to Plan" (onLeave) described by `futureLine`
 * (PC-12). A last Step with nothing to offer has no forward button: never a disabled Next without a reason. The line under the tiles
 * is a live status with an icon (the timer for a held Next, the Plan's calendar for a future meal).
 */
export function CookNavTiles({ isFirst, isLast, onBack, onNext, onMarkCooked, onDone, heldText, markLabel, futureLine, onLeave, leaveLabel, nextLabel, children }: CookNavTilesProps): ReactNode {
  const lineId = useId()
  const held = !isLast && heldText ? heldText : ''
  const future = isLast && futureLine ? futureLine : ''
  const line = held || future
  let forward: ReactNode = null
  if (!isLast) {
    forward = (
      <Button size="lg" icon="next" className="cook-nav__tile" data-arrow="end" onClick={onNext} disabled={Boolean(held)} aria-describedby={held ? lineId : undefined}>
        {nextLabel ?? cookStrings.next}
      </Button>
    )
  } else if (future) {
    forward = onLeave ? (
      <Button size="lg" icon="plan" className="cook-nav__tile" onClick={onLeave} aria-describedby={lineId}>
        {leaveLabel ?? cookStrings.backToPlan}
      </Button>
    ) : null
  } else if (onMarkCooked) {
    forward = (
      <Button size="lg" icon="markCooked" className="cook-nav__tile" onClick={onMarkCooked}>
        {markLabel ?? cookStrings.markAsCooked}
      </Button>
    )
  } else if (onDone) {
    forward = (
      <Button size="lg" icon="next" className="cook-nav__tile" data-arrow="end" onClick={onDone}>
        {cookStrings.done}
      </Button>
    )
  }
  return (
    <div className="cook-nav" data-last={isLast ? '' : undefined}>
      {children}
      <Button variant="secondary" size="lg" icon="back" className="cook-nav__tile" disabled={isFirst} onClick={onBack}>
        {cookStrings.back}
      </Button>
      {forward}
      <p id={lineId} className="cook-nav__held" role="status">
        {line ? (
          <>
            <Icon name={held ? 'timer' : 'plan'} size={16} />
            {line}
          </>
        ) : null}
      </p>
    </div>
  )
}
