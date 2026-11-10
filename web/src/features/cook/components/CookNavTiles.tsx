import type { ReactNode } from 'react'
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
}

/**
 * Full-width Back and Next tiles (buttons named "Back" and "Next"). Back is
 * disabled on the first Step. On the last Step "Next" is replaced by "Mark as
 * Cooked" (when onMarkCooked is given) or "Done" (onDone); with neither, Next
 * stays but is disabled.
 */
export function CookNavTiles({ isFirst, isLast, onBack, onNext, onMarkCooked, onDone }: CookNavTilesProps): ReactNode {
  let forward: ReactNode
  if (!isLast) {
    forward = <Button size="lg" className="cook-nav__tile" onClick={onNext}>{cookStrings.next}</Button>
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
    </div>
  )
}
