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
}

/**
 * Full-width Back and Next tiles (buttons named "Back" and "Next"). Back is
 * disabled on the first Step. On the last Step "Next" is replaced by "Mark as
 * Cooked" (when onMarkCooked is given) or "Done" (onDone); with neither, Next
 * stays but is disabled. With heldText, Next is disabled and described by that line (a live status).
 */
export function CookNavTiles({ isFirst, isLast, onBack, onNext, onMarkCooked, onDone, heldText }: CookNavTilesProps): ReactNode {
  const heldId = useId()
  let forward: ReactNode
  if (!isLast) {
    forward = (
      <Button size="lg" className="cook-nav__tile" onClick={onNext} disabled={Boolean(heldText)} aria-describedby={heldText ? heldId : undefined}>
        {cookStrings.next}
      </Button>
    )
  } else if (onMarkCooked) {
    forward = <Button size="lg" className="cook-nav__tile" onClick={onMarkCooked}>{cookStrings.markAsCooked}</Button>
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
