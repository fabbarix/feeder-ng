// The question before a Leftover is answered when the answer would replan Planned Meals: names them, then Cancel or the answer.
import { answerLabel, answerTitle, leftoverStrings } from '../../lib/leftovers/copy'
import { replannedNotes } from '../../lib/leftovers/sheetModel'
import type { AskedAnswer } from '../../lib/leftovers/useLeftoverFlow'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import './LeftoverActions.css'

export interface LeftoverAskDialogProps {
  asked: AskedAnswer | null
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function LeftoverAskDialog({ asked, busy = false, onConfirm, onCancel }: LeftoverAskDialogProps) {
  if (asked === null) return null
  return (
    <Dialog
      open
      onClose={onCancel}
      title={answerTitle(asked.leftover.recipeName)}
      actions={
        <>
          <Button variant="tertiary" onClick={onCancel}>
            {leftoverStrings.cancel}
          </Button>
          <Button variant={asked.answer === 'threw_out' ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
            {answerLabel(asked.answer)}
          </Button>
        </>
      }
    >
      <div className="leftover-sheet__stack">
        {replannedNotes(asked.replanned).map((note) => (
          <p key={note.key} className="leftover-sheet__note">
            {note.text}
          </p>
        ))}
      </div>
    </Dialog>
  )
}
