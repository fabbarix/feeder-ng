import type { ReactNode } from 'react'

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
export function CookNavTiles(_props: CookNavTilesProps): ReactNode {
  return null
}
