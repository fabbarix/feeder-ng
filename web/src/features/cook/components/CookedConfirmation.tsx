import type { ReactNode } from 'react'
import type { LeftoverOutcome } from '../../plan/lib/cook'
import { Button, Icon, Tile } from '../../../ui'
import { cookStrings } from '../strings'

export interface CookedConfirmationProps {
  recipeName: string
  /** Sentence from plan/lib/cook leftoverOutcomeText. B9-45 replaces it with `outcome` (the Leftover tile). */
  outcomeText?: string
  /** B9-45 (PC-02), not built: "Sat Dinner", after the Recipe name. */
  mealLabel?: string
  /** B9-45 (PC-02), not built: where the Leftover went (plan/lib/cook leftoverTile); no tile for kind "none". */
  outcome?: LeftoverOutcome | null
  /** B9-45 (PC-02), not built: "Back to Plan" or "Back to Today" (lib/origin backLabel); default "Back to Today". */
  leaveLabel?: string
  /** B9-45 (PC-02), not built: Undo Cooked (SAFE-03), named `undoLabel`; no button without it. */
  onUndo?: () => void
  undoLabel?: string
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
        {outcomeText ?? ''}
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
