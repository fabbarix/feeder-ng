// The "Courses" section of the Date Attendance sheet: per Course, the pills over that date's Attendance and "Reset to usual".
import { Button } from '../../../ui'
import { coursesStrings } from '../coursesStrings'
import type { DateCourseDraft } from '../lib/dateCourses'
import type { Member } from '../types'
import { CourseEaters } from './CourseEaters'

const s = coursesStrings.date

export interface DateCoursesSectionProps {
  drafts: readonly DateCourseDraft[]
  /** The Members of that date's Attendance (the sheet's current draft). */
  members: readonly Member[]
  disabled?: boolean
  onToggle: (courseId: number, memberId: number, eats: boolean) => void
  /** "Reset to usual" on a Course. */
  onReset: (courseId: number) => void
}

export function DateCoursesSection({ drafts, members, disabled, onToggle, onReset }: DateCoursesSectionProps) {
  return (
    <section aria-label={s.section} className="date-courses">
      {drafts.map((d) => (
        <div key={d.courseId} className="date-courses__course">
          <CourseEaters
            courseName={d.name}
            groupLabel={s.group(d.name)}
            members={members}
            optOutMemberIds={d.optOutMemberIds}
            disabled={disabled}
            onChange={(memberId, eats) => onToggle(d.courseId, memberId, eats)}
          />
          <Button variant="tertiary" aria-label={s.resetLabel(d.name)} disabled={disabled || !d.isOverride} onClick={() => onReset(d.courseId)}>
            {s.reset}
          </Button>
        </div>
      ))}
    </section>
  )
}
