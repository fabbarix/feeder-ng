import { useState } from 'react'
import { BottomSheet, Button, DateField, StepperField } from '../../../ui'
import { clampGuests, emptiesDate, MAX_GUESTS, MIN_GUESTS, portionsPreview, portionsPreviewText } from '../lib/dateAttendance'
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
  onSave: (attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number) => void | Promise<void>
  /**
   * B5-F1: the date is the slot block's, so it shows as text and cannot change (Plan and Today). Settings > Meal Slots leaves it
   * false: the DateField stays. `guests` is passed to `onSave` only when the Guests changed (then `onSave(attendance, courses, guests)`).
   */
  dateReadOnly?: boolean
  onReset: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.attendance

/** A BottomSheet "<name> on <date>": a DateField "Date" (its calendar), AttendanceEditor, "Save for this date",
 *  "Reset to usual Attendance" (enabled only for an override); a date that is not on the slot's weekday is an alert and blocks saving. */
export function DateAttendancePanel(props: DateAttendancePanelProps) {
  const { open, slot, date, onClose } = props
  const title = props.dateReadOnly ? text.whosEatingTitle(slot.name, date) : text.dateTitle(slot.name, date)
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {/* A new draft whenever the server's answer for the date changes. */}
      <DateForm key={`${date}|${props.attendance ? props.attendance.isOverride : 'none'}|${props.attendance?.guests ?? 0}|${(props.attendance?.courses ?? []).map((c) => (c.isOverride ? 1 : 0)).join('')}`} {...props} />
    </BottomSheet>
  )
}

function DateForm({ slot, date, attendance, members, saving, dateReadOnly = false, onChangeDate, onSave, onReset }: DateAttendancePanelProps) {
  const [draft, setDraft] = useState<AttendanceEntry[]>(() => attendance?.attendance ?? slot.attendance)
  const [guests, setGuests] = useState<number>(() => attendance?.guests ?? 0)
  const served = attendance?.courses ?? []
  // CRS D2: the Courses of the date; the section shows only when the slot serves more than one Course.
  const [courseDrafts, setCourseDrafts] = useState<DateCourseDraft[]>(() => dateCourseDrafts(served))
  const showCourses = served.length > 1
  const attendees = members.filter((m) => draft.some((a) => a.memberId === m.id))
  const problem = dateProblem(slot.weekday, date)
  const guestsChanged = guests !== (attendance?.guests ?? 0)
  const empty = emptiesDate(draft, guests)

  const save = () => {
    // B5-F1: Guests go with the save only when they changed (a Courses-only save leaves them out).
    const sentGuests = guestsChanged ? guests : undefined
    const changes = showCourses ? dateCourseChanges(served, courseDrafts) : []
    if (changes.length === 0) return sentGuests === undefined ? onSave(draft) : onSave(draft, undefined, sentGuests)
    // Only the Courses changed: the date's Attendance is left as it is (undefined).
    const attendanceChanged = !attendance || !sameAttendance(draft, attendance.attendance)
    const attendanceArg = attendanceChanged ? draft : undefined
    return sentGuests === undefined ? onSave(attendanceArg, changes) : onSave(attendanceArg, changes, sentGuests)
  }

  const usualOptOuts = (courseId: number) => slot.courses?.find((c) => c.id === courseId)?.optOutMemberIds ?? []

  return (
    <div className="settings__stack">
      {dateReadOnly ? null : <DateField label={text.date} value={date} onChange={onChangeDate} />}
      {problem ? (
        <p role="alert" className="settings__error">
          {problem}
        </p>
      ) : null}
      <p className="settings__muted">{text.thisDateOnly}</p>
      <AttendanceEditor members={members} value={draft} onChange={setDraft} />
      <StepperField label={text.guests} helper={text.guestsHelper} value={guests} min={MIN_GUESTS} max={MAX_GUESTS} onChange={(n) => setGuests(clampGuests(n))} />
      <p className="settings__muted">{portionsPreviewText(portionsPreview(members, draft, guests))}</p>
      {empty ? <p className="settings__muted">{text.emptiedNote}</p> : null}
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
