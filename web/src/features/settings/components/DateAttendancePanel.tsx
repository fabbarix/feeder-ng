import { useState } from 'react'
import { BottomSheet, Button, DateField } from '../../../ui'
import { dateProblem } from '../lib/attendanceDate'
import { dateCourseChanges, dateCourseDrafts, hasDateOverride, resetDateCourse, sameAttendance, withDateEater, type DateCourseDraft } from '../lib/dateCourses'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateAttendance, DateCourseChange, MealSlot, Member } from '../types'
import { AttendanceEditor } from './AttendanceEditor'
import { DateCoursesSection } from './DateCoursesSection'
import '../settings.css'

export interface DateAttendancePanelProps {
  open: boolean
  slot: MealSlot
  /** The date being edited (YYYY-MM-DD) and what the server has for it. */
  date: string
  attendance: DateAttendance | undefined
  members: Member[]
  saving?: boolean
  onChangeDate: (date: string) => void
  /**
   * `attendance` is undefined when only the Courses changed (the date's Attendance is left as it is); `courses` is left out
   * (not passed at all) when no Course changed.
   */
  onSave: (attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[]) => void | Promise<void>
  onReset: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.attendance

/** A BottomSheet "<name> on <date>": a DateField "Date" (its calendar), AttendanceEditor, "Save for this date",
 *  "Reset to usual Attendance" (enabled only for an override); a date that is not on the slot's weekday is an alert and blocks saving. */
export function DateAttendancePanel(props: DateAttendancePanelProps) {
  const { open, slot, date, onClose } = props
  return (
    <BottomSheet open={open} onClose={onClose} title={text.dateTitle(slot.name, date)}>
      {/* A new draft whenever the server's answer for the date changes. */}
      <DateForm key={`${date}|${props.attendance ? props.attendance.isOverride : 'none'}|${(props.attendance?.courses ?? []).map((c) => (c.isOverride ? 1 : 0)).join('')}`} {...props} />
    </BottomSheet>
  )
}

function DateForm({ slot, date, attendance, members, saving, onChangeDate, onSave, onReset }: DateAttendancePanelProps) {
  const [draft, setDraft] = useState<AttendanceEntry[]>(() => attendance?.attendance ?? slot.attendance)
  const served = attendance?.courses ?? []
  // CRS D2: the Courses of the date; the section shows only when the slot serves more than one Course.
  const [courseDrafts, setCourseDrafts] = useState<DateCourseDraft[]>(() => dateCourseDrafts(served))
  const showCourses = served.length > 1
  const attendees = members.filter((m) => draft.some((a) => a.memberId === m.id))
  const problem = dateProblem(slot.weekday, date)

  const save = () => {
    const changes = showCourses ? dateCourseChanges(served, courseDrafts) : []
    if (changes.length === 0) return onSave(draft)
    // Only the Courses changed: the date's Attendance is left as it is (undefined).
    const attendanceChanged = !attendance || !sameAttendance(draft, attendance.attendance)
    return onSave(attendanceChanged ? draft : undefined, changes)
  }

  const usualOptOuts = (courseId: number) => slot.courses?.find((c) => c.id === courseId)?.optOutMemberIds ?? []

  return (
    <div className="settings__stack">
      <DateField label={text.date} value={date} onChange={onChangeDate} />
      {problem ? (
        <p role="alert" className="settings__error">
          {problem}
        </p>
      ) : null}
      <p className="settings__muted">{text.thisDateOnly}</p>
      <AttendanceEditor members={members} value={draft} onChange={setDraft} />
      {showCourses ? (
        <DateCoursesSection
          drafts={courseDrafts}
          members={attendees}
          disabled={saving}
          onToggle={(courseId, memberId, eats) => setCourseDrafts((d) => withDateEater(d, courseId, memberId, eats))}
          onReset={(courseId) => setCourseDrafts((d) => resetDateCourse(d, courseId, usualOptOuts(courseId)))}
        />
      ) : null}
      <div className="settings__row">
        <Button disabled={problem !== null} loading={saving} onClick={() => void save()}>
          {text.saveDate}
        </Button>
        <Button variant="tertiary" disabled={!hasDateOverride(attendance) || saving} onClick={() => void onReset()}>
          {text.resetDate}
        </Button>
      </div>
    </div>
  )
}
