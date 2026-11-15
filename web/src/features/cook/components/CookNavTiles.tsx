import { useId, type ReactNode } from 'react'
import { Button } from '../../../ui'
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
}

/**
 * Full-width Back and Next tiles (buttons named "Back" and "Next"). Back is
 * disabled on the first Step. On the last Step "Next" is replaced by "Mark as
 * Cooked" (when onMarkCooked is given) or "Done" (onDone); with neither, Next
 * stays but is disabled. With heldText, Next is disabled and described by that line (a live status).
 */
export function CookNavTiles({ isFirst, isLast, onBack, onNext, onMarkCooked, onDone, heldText, markLabel }: CookNavTilesProps): ReactNode {
  const heldId = useId()
  let forward: ReactNode
  if (!isLast) {
    forward = (
      <Button size="lg" className="cook-nav__tile" onClick={onNext} disabled={Boolean(heldText)} aria-describedby={heldText ? heldId : undefined}>
        {cookStrings.next}
      </Button>
    )
  } else if (onMarkCooked) {
    forward = <Button size="lg" className="cook-nav__tile" onClick={onMarkCooked}>{markLabel ?? cookStrings.markAsCooked}</Button>
  } else if (onDone) {
    forward = <Button size="lg" className="cook-nav__tile" onClick={onDone}>{cookStrings.done}</Button>
  } else {
    forward = <Button size="lg" className="cook-nav__tile" disabled>{cookStrings.next}</Button>
  }
  return (
    <div className="cook-nav">
      <Button variant="secondary" size="lg" className="cook-nav__tile" disabled={isFirst} onClick={onBack}>
        {cookStrings.back}
      </Button>
      {forward}
      <p id={heldId} className="cook-nav__held" role="status">
        {!isLast && heldText ? heldText : null}
      </p>
    </div>
  )
}
