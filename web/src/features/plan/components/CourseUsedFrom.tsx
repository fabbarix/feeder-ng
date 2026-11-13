import type { ReactNode } from 'react'
import type { UsedFromController } from '../hooks/useUsedFrom'
import { UsedFromSection } from './UsedFromSection'

export interface CourseUsedFromProps {
  usedFrom: UsedFromController
  courseId: number
}

/** The Used from section of one Course, wired to the sheet's controller. */
export function CourseUsedFrom({ usedFrom, courseId }: CourseUsedFromProps): ReactNode {
  return (
    <UsedFromSection
      summary={usedFrom.summary(courseId)}
      lines={usedFrom.lines(courseId)}
      expanded={usedFrom.expanded(courseId)}
      onToggleExpanded={() => usedFrom.toggleExpanded(courseId)}
      onToggle={(ingredientId, lotId, on) => usedFrom.toggle(courseId, ingredientId, lotId, on)}
      onAmount={(ingredientId, lotId, amount) => usedFrom.setAmount(courseId, ingredientId, lotId, amount)}
      conflicts={usedFrom.conflictsOf(courseId)}
    />
  )
}
