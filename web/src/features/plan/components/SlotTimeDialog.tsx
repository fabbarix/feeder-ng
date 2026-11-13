import type { ReactNode } from 'react'
import type { PlanSlot } from '../types'

export interface SlotTimeDialogProps {
  /** The slot being changed; null = closed. */
  slot: PlanSlot | null
  busy?: boolean
  onSave: (time: string) => void
  /** "Back to 19:30": the usual time again. Shown only when the date has its own time. */
  onBack: () => void
  onClose: () => void
}

/** "Time for Thu Dinner": the shared Dialog with the shared TimeField (caption "Time", helper "Usually 19:30"), Save, Back to the usual time, Cancel. */
export function SlotTimeDialog(_props: SlotTimeDialogProps): ReactNode {
  return null
}
