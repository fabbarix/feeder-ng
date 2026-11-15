import type { ReactNode } from 'react'
import { ConfirmDialog } from '../../../ui'
import { courseStrings } from '../strings'
import { joinNames } from '../lib/recipeCourses'
import type { CourseLoss } from '../types'

export interface CourseLossDialogProps {
  open: boolean
  loss: CourseLoss
  onConfirm: () => void
  onCancel: () => void
}

/**
 * CRS E2: the confirm before a save that takes a Course off and so removes Slot Rules. A danger ConfirmDialog (SAFE R1: Cancel focused,
 * outline Cancel, no Close); each Slot Rule that goes is a row (R-E), not a bullet.
 */
export function CourseLossDialog({ open, loss, onConfirm, onCancel }: CourseLossDialogProps): ReactNode {
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      title={courseStrings.lossTitle(joinNames(loss.courseNames), loss.rules.length)}
      body={courseStrings.lossBody}
      groups={[{ label: courseStrings.lossRulesHeading, rows: loss.rules.map((r) => ({ key: r.label })) }]}
      cancelLabel={courseStrings.lossCancel}
      confirmLabel={courseStrings.lossConfirm}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
