import type { ReactNode } from 'react'
import type { CourseChoice } from '../../lib/courses'
import type { SelectFieldProps } from './Select'
import type { SelectOption } from './lib'

export interface CourseSelectProps extends SelectFieldProps {
  /** Active Courses in household order; a caller limits them (a Meal Slot's Courses) by passing fewer. */
  courses: readonly CourseChoice[]
  value: number | null
  onChange: (id: number) => void
}

export interface CourseMultiSelectProps extends SelectFieldProps {
  courses: readonly CourseChoice[]
  values: readonly number[]
  /** Always in household order, whatever the order of picking. */
  onChange: (ids: number[]) => void
}

/** Options for the Course selects: the name, "main Course" as meta on the main one; household order. */
export function courseOptions(_courses: readonly CourseChoice[]): SelectOption<number>[] {
  throw new Error('not implemented')
}

/** One Course (the replacement in the Delete dialog, a Slot Rule's Course). */
export function CourseSelect(_props: CourseSelectProps): ReactNode {
  throw new Error('not implemented')
}

/** Several Courses (filters). A Recipe's own Courses use the unordered CoursePicker. */
export function CourseMultiSelect(_props: CourseMultiSelectProps): ReactNode {
  throw new Error('not implemented')
}
