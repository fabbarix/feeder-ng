// B9-46 (PC-08): the Away sheet. TEST-AUTHOR STUB: renders nothing.
import type { ReactNode } from 'react'
import type { Away } from '../types'

export interface AwaySheetProps {
  open: boolean
  /** The Member the sheet is for (opened from the Member sheet): the title reads "<Name> is away" and there are no Who pills. */
  memberId?: number
  /** Opened from a Meal Slot: the first Meal Slot missed. */
  from?: { date: string; mealSlotId: number }
  /** Editing this Away. */
  away?: Away
  onClose: () => void
}

export function AwaySheet(_props: AwaySheetProps): ReactNode {
  return null
}
