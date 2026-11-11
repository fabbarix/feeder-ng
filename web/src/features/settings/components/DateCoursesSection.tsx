// The "Courses" section of the Date Attendance sheet: per Course, the pills over that date's Attendance and "Reset to usual".
import { useId } from 'react'
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
  const baseId = useId()
  const headingId = `${baseId}-heading`
  return (
    <section aria-labelledby={headingId} className="date-courses">
      <h3 id={headingId} className="date-courses__heading">
        {s.section}
      </h3>
      {drafts.map((d) => {
        const nameId = `${baseId}-course-${d.courseId}`
        return (
          <div key={d.courseId} className="date-courses__course">
            <p id={nameId} className="date-courses__name">
              {d.name}
            </p>
            <CourseEaters
              courseName={d.name}
              labelId={nameId}
              members={members}
              optOutMemberIds={d.optOutMemberIds}
              disabled={disabled}
              onChange={(memberId, eats) => onToggle(d.courseId, memberId, eats)}
            />
            <Button variant="tertiary" aria-label={s.resetLabel(d.name)} disabled={disabled || !d.isOverride} onClick={() => onReset(d.courseId)}>
              {s.reset}
            </Button>
          </div>
        )
      })}
    </section>
  )
}
