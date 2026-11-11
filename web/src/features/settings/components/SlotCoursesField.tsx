// The Meal Slot editor's Courses field: the shared ordered CoursePicker with, in every chosen row, the Optional switch and
// "Who eats it". STUB (CRS D2 design step).
import type { ReactNode } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import type { AttendanceEntry, Member, SlotCourseInput } from '../types'

export interface SlotCoursesFieldProps {
  /** The household's active Courses, household order. */
  courses: readonly CourseChoice[]
  members: readonly Member[]
  /** The draft's usual Attendance: only these Members are offered under "Who eats it". */
  attendance: readonly AttendanceEntry[]
  value: readonly SlotCourseInput[]
  onChange: (next: SlotCourseInput[]) => void
  /** Replaces the picker's own empty-choice message. */
  error?: string
  disabled?: boolean
}

export function SlotCoursesField(_props: SlotCoursesFieldProps): ReactNode {
  return null
}
