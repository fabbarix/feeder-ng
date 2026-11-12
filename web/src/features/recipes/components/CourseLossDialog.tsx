import type { ReactNode } from 'react'
import type { CourseLoss } from '../types'

export interface CourseLossDialogProps {
  open: boolean
  loss: CourseLoss
  onConfirm: () => void
  onCancel: () => void
}

/** CRS E2: the confirm before a save that takes a Course off and so removes Slot Rules: a modal dialog that names each rule. */
export function CourseLossDialog(_props: CourseLossDialogProps): ReactNode {
  return null
}
