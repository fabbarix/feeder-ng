import type { ReactNode } from 'react'
import { Button, Icon, Tile } from '../../../ui'
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
 * Shown by Cook Mode after a successful Mark as Cooked, in place of the Step: a success status tile with the
 * CheckCircle icon and the heading "Marked as Cooked", the Recipe name, the Leftover outcome sentence (role status),
 * the children, and one primary large button "Back to Today" (onLeave). Mark as Cooked is never offered again.
 * The User leaves with the button; nothing redirects by itself.
 */
export function CookedConfirmation({ recipeName, outcomeText, children, onLeave }: CookedConfirmationProps): ReactNode {
  return (
    <Tile as="section" variant="status" status="success" span="full" className="cook-confirmation">
      <h2 className="cook-confirmation__title">
        <Icon name="success" size={28} />
        {cookStrings.markedAsCooked}
      </h2>
      <p className="cook-confirmation__recipe">{recipeName}</p>
      <p role="status" className="cook-confirmation__outcome">
        {outcomeText}
      </p>
      {children}
      <div className="cook-confirmation__actions">
        <Button variant="primary" size="lg" onClick={onLeave}>
          {cookStrings.backToToday}
        </Button>
      </div>
    </Tile>
  )
}
