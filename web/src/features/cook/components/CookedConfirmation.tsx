import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { cookStrings } from '../strings'

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
 * Mark as Cooked is never offered again. The User leaves with the button; nothing redirects by itself.
 */
export function CookedConfirmation({ recipeName, outcomeText, children, onLeave }: CookedConfirmationProps): ReactNode {
  return (
    <Tile as="section" size="full" tone="accent" className="cook-confirmation">
      <h2 className="cook-confirmation__title">{cookStrings.markedAsCooked}</h2>
      <p className="cook-confirmation__recipe">{recipeName}</p>
      <p role="status" className="cook-confirmation__outcome">
        {outcomeText}
      </p>
      {children}
      <div className="cook-confirmation__actions">
        <Button variant="primary" onClick={onLeave}>
          {cookStrings.backToToday}
        </Button>
      </div>
    </Tile>
  )
}
