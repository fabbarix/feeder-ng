import type { ReactNode } from 'react'

export interface CookedConfirmationProps {
  recipeName: string
  /** Sentence from plan/lib/cook leftoverOutcomeText. */
  outcomeText: string
  /** Shortfall notices and the Stock correction, rendered under the outcome. */
  children?: ReactNode
  /** "Back to Today": leaves Cook Mode. */
  onLeave: () => void
}

/**
 * Shown by Cook Mode after a successful Mark as Cooked, in place of the Step: heading "Marked as Cooked" with the
 * Recipe name, the Leftover outcome sentence (role status), the children, and one button "Back to Today" (onLeave).
 * Mark as Cooked is never offered again. STUB (red tests): the Developer implements it.
 */
export function CookedConfirmation(_props: CookedConfirmationProps): ReactNode {
  return null
}
