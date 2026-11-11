// The "Courses" section of the Date Attendance sheet: per Course, the pills over that date's Attendance and "Reset to usual".
// STUB (CRS D2 design step).
import type { ReactNode } from 'react'
import type { DateCourseDraft } from '../lib/dateCourses'
import type { Member } from '../types'

export interface DateCoursesSectionProps {
  drafts: readonly DateCourseDraft[]
  /** The Members of that date's Attendance (the sheet's current draft). */
  members: readonly Member[]
  disabled?: boolean
  onToggle: (courseId: number, memberId: number, eats: boolean) => void
  /** "Reset to usual" on a Course. */
  onReset: (courseId: number) => void
}

export function DateCoursesSection(_props: DateCoursesSectionProps): ReactNode {
  return null
}
