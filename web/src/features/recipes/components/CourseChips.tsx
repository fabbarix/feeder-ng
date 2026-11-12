import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { courseStrings } from '../strings'

export interface CourseChipsProps {
  /** The Recipe's Course names, household order. */
  names: readonly string[]
  /** Adds the "Whole meal" chip. The caller passes true only for a Whole meal Recipe whose Courses include the main Course. */
  wholeMeal?: boolean
}

/** CRS E2: a list named "Courses" of tag Chips, one per Course, then "Whole meal"; shared by the Recipe tile and the Recipe detail. Renders nothing for no names. */
export function CourseChips({ names, wholeMeal = false }: CourseChipsProps): ReactNode {
  if (names.length === 0) return null
  return (
    <ul className="course-chips" aria-label={courseStrings.chipsLabel}>
      {names.map((name, i) => (
        <li key={`${i}-${name}`}>
          <Chip kind="tag">{name}</Chip>
        </li>
      ))}
      {wholeMeal ? (
        <li>
          <Chip kind="tag">{courseStrings.wholeMealChip}</Chip>
        </li>
      ) : null}
    </ul>
  )
}
