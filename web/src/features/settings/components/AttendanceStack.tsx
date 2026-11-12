import type { CardAttendance } from '../lib/mealSlotCards'
import type { Member } from '../types'
import '../mealSlotCards.css'

export interface AttendanceStackProps {
  attendance: CardAttendance
  members: Member[]
  /** Avatars before "+N" (default 4). */
  max?: number
  /** Names the list for assistive technology, e.g. "Attending Dinner". */
  label: string
}

/** STUB (test-first): an Avatar stack of the Members in `attendance` with "+N" and the text "Fabio only". Renders nothing for 'everyone' and 'nobody'. */
export function AttendanceStack(_props: AttendanceStackProps) {
  return null
}
