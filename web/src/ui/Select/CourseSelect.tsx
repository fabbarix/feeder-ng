// CourseSelect and CourseMultiSelect (CRS D1): thin wrappers on Select and MultiSelect, like MealSlotSelect.
import { useMemo, type ReactNode } from 'react'
import { inHouseholdOrder, type CourseChoice } from '../../lib/courses'
import { MultiSelect, Select, type SelectFieldProps } from './Select'
import type { SelectOption } from './lib'
import { coursePickerStrings } from '../CoursePicker/strings'

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
export function courseOptions(courses: readonly CourseChoice[]): SelectOption<number>[] {
  return courses.map((c) => ({ value: c.id, label: c.name, meta: c.main ? coursePickerStrings.mainCourse : undefined }))
}

/** One Course (the replacement in the Delete dialog, a Slot Rule's Course). */
export function CourseSelect({ courses, value, onChange, ...field }: CourseSelectProps): ReactNode {
  const options = useMemo(() => courseOptions(courses), [courses])
  return <Select<number> {...field} entityName="Course" options={options} value={value} onChange={onChange} />
}

/** Several Courses (filters). A Recipe's own Courses use the unordered CoursePicker. */
export function CourseMultiSelect({ courses, values, onChange, ...field }: CourseMultiSelectProps): ReactNode {
  const options = useMemo(() => courseOptions(courses), [courses])
  return (
    <MultiSelect<number>
      {...field}
      entityName="Course"
      options={options}
      values={[...values]}
      onChange={(next) => onChange(inHouseholdOrder(next, courses))}
    />
  )
}
