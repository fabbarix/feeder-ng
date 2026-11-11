// "Who eats it": the attending Members as toggle pills for one Course. STUB (CRS D2 design step).
import type { ReactNode } from 'react'
import type { Member } from '../types'

export interface CourseEatersProps {
  courseName: string
  /** The group's accessible name ("Who eats Dessert", "Who eats Dessert on this date"). */
  groupLabel: string
  /** The Members offered: the ones who attend (the caller filters). */
  members: readonly Member[]
  /** Members who opt out of this Course; an id that is not in `members` is ignored. */
  optOutMemberIds: readonly number[]
  disabled?: boolean
  /** A pill was pressed: `eats` is the new state of that Member. */
  onChange: (memberId: number, eats: boolean) => void
}

export function CourseEaters(_props: CourseEatersProps): ReactNode {
  return null
}
