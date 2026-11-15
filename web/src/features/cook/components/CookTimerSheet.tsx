// B9-40 stub (PC-03): the sheet a tap on a timer pill opens. The developer implements it.
import type { ReactNode } from 'react'
import type { TimerItem } from '../hooks/useTimers'

export interface CookTimerSheetProps {
  /** The timer to show; null keeps the sheet closed. */
  item: TimerItem | null
  /** The scope Cook Mode is open for (words the place line of another scope's timer). */
  scope: string
  holdsNext?: boolean
  onClose: () => void
  onAddMinute: (id: number) => void
  onCancel: (id: number) => void
  onDismiss: (id: number) => void
}

export function CookTimerSheet(_props: CookTimerSheetProps): ReactNode {
  return null
}
