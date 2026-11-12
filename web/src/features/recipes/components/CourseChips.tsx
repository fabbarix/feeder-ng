import type { ReactNode } from 'react'

export interface CourseChipsProps {
  /** The Recipe's Course names, household order. */
  names: readonly string[]
  /** Adds the "Whole meal" chip. The caller passes true only for a Whole meal Recipe whose Courses include the main Course. */
  wholeMeal?: boolean
}

/** CRS E2: a list named "Courses" of tag Chips, one per Course, then "Whole meal"; shared by the Recipe tile and the Recipe detail. Renders nothing for no names. */
export function CourseChips(_props: CourseChipsProps): ReactNode {
  return null
}
