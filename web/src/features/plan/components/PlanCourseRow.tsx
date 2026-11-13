import type { ReactNode } from 'react'
import type { CourseRowModel } from '../lib/courses'
import type { PlanSlot, SlotKey } from '../types'

export interface PlanCourseRowProps {
  row: CourseRowModel
  slot: PlanSlot
  today: string
  onOpen: (key: SlotKey) => void
  onSwap: (key: SlotKey) => void
  onPin: (key: SlotKey) => void
  onUnpin: (key: SlotKey) => void
  onChoose: (key: SlotKey) => void
}

/** One Course of a slot on a day tile, built on ListRow: Course label (meta), Recipe (title), one line of chips, Swap and Pin at the end. Stub. */
export function PlanCourseRow(_props: PlanCourseRowProps): ReactNode {
  throw new Error('ds-plan: PlanCourseRow is not implemented')
}
