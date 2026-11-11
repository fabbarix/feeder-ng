// The Meal Slot editor's Courses field: the shared ordered CoursePicker with, in every chosen row, the Optional switch and
// "Who eats it". Renders and wires events; the rules are in lib/slotCourses.
import type { CourseChoice } from '../../../lib/courses'
import { CoursePicker, Switch } from '../../../ui'
import { coursesStrings } from '../coursesStrings'
import { attendeesOf, withCourseIds, withEater, withOptional } from '../lib/slotCourses'
import type { AttendanceEntry, Member, SlotCourseInput } from '../types'
import { CourseEaters } from './CourseEaters'

const s = coursesStrings.slot

export interface SlotCoursesFieldProps {
  /** The household's active Courses, household order. */
  courses: readonly CourseChoice[]
  members: readonly Member[]
  /** The draft's usual Attendance: only these Members are offered under "Who eats it". */
  attendance: readonly AttendanceEntry[]
  value: readonly SlotCourseInput[]
  onChange: (next: SlotCourseInput[]) => void
  /** Replaces the picker's own empty-choice message. */
  error?: string
  disabled?: boolean
}

export function SlotCoursesField({ courses, members, attendance, value, onChange, error, disabled }: SlotCoursesFieldProps) {
  const attendees = attendeesOf(members, attendance)
  return (
    <CoursePicker
      label={s.courses}
      courses={courses}
      value={value.map((c) => c.id)}
      onChange={(ids) => onChange(withCourseIds(value, ids))}
      helper={s.optionalHelper}
      error={error}
      disabled={disabled}
      renderRowExtras={({ course }) => {
        const row = value.find((c) => c.id === course.id)
        if (!row) return null
        return (
          <>
            <Switch
              label={s.optional}
              aria-label={s.optionalLabel(course.name)}
              checked={row.optional}
              disabled={disabled}
              onChange={(optional) => onChange(withOptional(value, course.id, optional))}
            />
            <div className="slot-courses__eaters">
              <span className="slot-courses__label">{s.whoEats}</span>
              {attendees.length === 0 ? (
                <p className="settings__muted">{s.chooseWhoAttends}</p>
              ) : (
                <CourseEaters
                  courseName={course.name}
                  groupLabel={s.whoEatsGroup(course.name)}
                  members={attendees}
                  optOutMemberIds={row.optOutMemberIds}
                  disabled={disabled}
                  onChange={(memberId, eats) => onChange(withEater(value, course.id, memberId, eats))}
                />
              )}
            </div>
          </>
        )
      }}
    />
  )
}
