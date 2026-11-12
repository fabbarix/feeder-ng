import type { ReactNode } from 'react'
import { Button, Dialog } from '../../../ui'
import { courseStrings } from '../strings'
import { joinNames } from '../lib/recipeCourses'
import type { CourseLoss } from '../types'

export interface CourseLossDialogProps {
  open: boolean
  loss: CourseLoss
  onConfirm: () => void
  onCancel: () => void
}

/** CRS E2: the confirm before a save that takes a Course off and so removes Slot Rules: a modal dialog that names each rule. */
export function CourseLossDialog({ open, loss, onConfirm, onCancel }: CourseLossDialogProps): ReactNode {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={courseStrings.lossTitle(joinNames(loss.courseNames), loss.rules.length)}
      tone="danger"
      actions={
        <>
          <Button variant="tertiary" data-autofocus onClick={onCancel}>
            {courseStrings.lossCancel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {courseStrings.lossConfirm}
          </Button>
        </>
      }
    >
      <p>{courseStrings.lossBody}</p>
      <ul className="course-loss__rules">
        {loss.rules.map((r) => (
          <li key={r.id}>{r.label}</li>
        ))}
      </ul>
    </Dialog>
  )
}
