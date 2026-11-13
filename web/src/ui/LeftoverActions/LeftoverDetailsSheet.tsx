// The details of one Leftover, opened from a Planned Meal's "From Mon's Chilli" link: portions, Use-by, its Storage Place
// when frozen, and its actions (each opens the same sheet as the rows do). Presentational.
import { actionLabel, leftoverRow, menuActions } from '../../lib/leftovers/rows'
import { detailsTitle, leftoverStrings } from '../../lib/leftovers/copy'
import type { Leftover, LeftoverActionKind } from '../../lib/leftovers'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import './LeftoverActions.css'

export interface LeftoverDetailsSheetProps {
  /** The Leftover to show; null = closed. */
  leftover: Leftover | null
  today: string
  onClose: () => void
  onAction: (kind: LeftoverActionKind, leftover: Leftover) => void
}

export function LeftoverDetailsSheet({ leftover, today, onClose, onAction }: LeftoverDetailsSheetProps) {
  if (leftover === null) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={detailsTitle(leftover.recipeName)}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {leftoverStrings.close}
          </Button>
          {menuActions(leftover, today).map((kind) => (
            <Button key={kind} variant="secondary" onClick={() => onAction(kind, leftover)}>
              {actionLabel(kind)}
            </Button>
          ))}
        </>
      }
    >
      <div className="leftover-sheet__stack">
        <p className="leftover-sheet__note">{leftoverRow(leftover, today).text}</p>
        {leftover.frozen ? <p className="leftover-sheet__note">{leftover.storagePlaceName ?? leftoverStrings.notSorted}</p> : null}
      </div>
    </Dialog>
  )
}
