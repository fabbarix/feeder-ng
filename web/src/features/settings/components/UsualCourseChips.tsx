// A Meal Slot card's usual Courses as Chips (MealSlotCard): a list of Chips, not bullets. Split out of the card file (B9-55).
import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import type { MealSlotCard } from '../lib/mealSlotCards'
import { settingsStrings } from '../strings'

const text = settingsStrings.slot

export function UsualCourseChips({ courses }: { courses: MealSlotCard['usualCourses'] }): ReactNode {
  return (
    <ul className="ms-courses" aria-label={text.usualCourses}>
      {courses.map((c) => (
        <li key={c.id} className="ms-course" data-optional={c.optional || undefined}>
          <Chip kind="tag">{c.optional ? `${c.name} (${text.optionalSuffix})` : c.name}</Chip>
        </li>
      ))}
    </ul>
  )
}
