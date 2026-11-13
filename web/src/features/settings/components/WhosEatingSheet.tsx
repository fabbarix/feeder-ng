import type { ReactNode } from 'react'
import type { AttendanceSheetOptions, WhosEatingTarget } from '../hooks/useAttendanceSheet'

export interface WhosEatingSheetProps extends Omit<AttendanceSheetOptions, 'onClose'> {
  /** The slot and date to edit; null = closed. */
  target: WhosEatingTarget | null
  onClose: () => void
}

/**
 * "Who's eating" for one Meal Slot on one date, opened from Plan and Today: the Date Attendance sheet (Members, Courses, Guests) with a
 * read-only date, fed by hooks/useAttendanceSheet. Settings > Meal Slots keeps its own entry to the same DateAttendancePanel.
 */
export function WhosEatingSheet(_props: WhosEatingSheetProps): ReactNode {
  return null
}
