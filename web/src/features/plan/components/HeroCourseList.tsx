// The hero's other Courses (TonightHero, several Courses): compact Course rows with Swap, Pin and the ⋮. Split out of the tile file
// (B9-55): rows with actions, not bullet sentences. Renders and wires events only.
import type { ReactNode } from 'react'
import type { CourseRowModel } from '../lib/courses'
import type { PlanSlot } from '../types'
import { CourseRow, type CourseRowHandlers } from './CourseRow'

export function HeroCourseList({ slot, rows, today, rowHandlers }: { slot: PlanSlot; rows: CourseRowModel[]; today: string; rowHandlers?: CourseRowHandlers }): ReactNode {
  return (
    <ul aria-label={`${slot.name} Courses`} className="plan-hero__courses">
      {rows.map((row) => (
        <CourseRow
          key={row.course.courseId}
          row={row}
          slot={slot}
          today={today}
          compact
          actions={['swap', 'pin', 'more']}
          onOpen={(k) => rowHandlers?.onOpen(k)}
          onSwap={rowHandlers?.onSwap}
          onPin={rowHandlers?.onPin}
          onUnpin={rowHandlers?.onUnpin}
          onMarkCooked={rowHandlers?.onMarkCooked}
          onChoose={rowHandlers?.onChoose}
        />
      ))}
    </ul>
  )
}
