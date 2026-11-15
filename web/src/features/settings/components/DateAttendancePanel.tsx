import { useState } from 'react'
import { BottomSheet, Button, DateField, FormActions, Muted, StepperField } from '../../../ui'
import { clampGuests, emptiesDate, MAX_GUESTS, MIN_GUESTS, portionsPreview, portionsPreviewText } from '../lib/dateAttendance'
import { dateProblem } from '../lib/attendanceDate'
import { documentLocale } from '../lib/locale'
import { dateLabel } from '../lib/mealSlotCards'
import { dateCourseChanges, dateCourseDrafts, hasDateOverride, resetDateCourse, sameAttendance, withDateEater, type DateCourseDraft } from '../lib/dateCourses'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateAttendance, DateCourseChange, MealSlot, Member } from '../types'
import { AttendanceEditor, type AttendanceEditorProps } from './AttendanceEditor'
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
  /** Passed to the Attendance rows (B9-46's "Eats here anyway" for a Member who is away), rendered under the Member's name. */
  memberExtra?: AttendanceEditorProps['memberExtra']
  locale?: string
}

const text = settingsStrings.attendance

/** What the server says for one date, as a key: a new answer for the same date replaces a pristine form, never an edited one. */
const answerKey = (a: DateAttendance | undefined) =>
  a ? `${a.isOverride}|${a.attendance.map((e) => `${e.memberId}:${e.portionFactorOverride}`).join(',')}|${a.guests ?? 0}|${(a.courses ?? []).map((c) => `${c.courseId}:${c.optOutMemberIds.join('.')}`).join(',')}` : 'none'

interface FormState {
  draft: AttendanceEntry[]
  guests: number
  courseDrafts: DateCourseDraft[]
  /** The Admin changed something since the form last started from an answer. */
  touched: boolean
}

const formFrom = (slot: MealSlot, attendance: DateAttendance | undefined): FormState => ({
  draft: attendance?.attendance ?? slot.attendance,
  guests: attendance?.guests ?? 0,
  courseDrafts: dateCourseDrafts(attendance?.courses ?? []),
  touched: false,
})

/**
 * A BottomSheet "Dinner on Thu 12 Nov": a DateField "Date" (its calendar), AttendanceEditor, Guests and the Courses of the date; the
 * footer is [Reset to usual Attendance] [Save for this date] (Reset only for an override). A date that is not on the slot's weekday is
 * an alert and blocks saving. A11Y-07: the form is never remounted while the answer arrives, so focus stays where it is; a pristine
 * form follows the answer, an edited one keeps its edits, and another date starts from that date's answer.
 */
export function DateAttendancePanel(props: DateAttendancePanelProps) {
  // Closed, nothing stays: the next opening starts from the answer again.
  return props.open ? <DateSheet {...props} /> : null
}

function DateSheet({ slot, date, attendance, members, saving, dateReadOnly = false, onChangeDate, onSave, onReset, onClose, memberExtra, locale = documentLocale() }: DateAttendancePanelProps) {
  const [form, setForm] = useState<FormState>(() => formFrom(slot, attendance))
  const [source, setSource] = useState({ date, answer: answerKey(attendance) })
  const answer = answerKey(attendance)
  if (source.date !== date || source.answer !== answer) {
    // Adjusting state while rendering (React's pattern for "reset when a prop changes") keeps the DOM, so focus is not lost.
    setSource({ date, answer })
    if (source.date !== date || !form.touched) setForm(formFrom(slot, attendance))
  }
  const { draft, guests, courseDrafts } = form
  const edit = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch, touched: true }))

  const served = attendance?.courses ?? []
  // CRS D2: the Courses of the date; the section shows only when the slot serves more than one Course.
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
  const title = dateReadOnly ? text.whosEatingTitle(slot.name, date) : text.dateTitle(slot.name, dateLabel(date, locale))

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      footer={
        <FormActions
          secondary={
            <Button variant="secondary" disabled={!hasDateOverride(attendance) || saving} onClick={() => void onReset()}>
              {text.resetDate}
            </Button>
          }
          primary={
            <Button disabled={problem !== null} loading={saving} onClick={() => void save()}>
              {text.saveDate}
            </Button>
          }
        />
      }
    >
      <div className="settings__stack">
        {dateReadOnly ? null : <DateField label={text.date} value={date} onChange={onChangeDate} />}
        {problem ? (
          <p role="alert" className="settings__error">
            {problem}
          </p>
        ) : null}
        <Muted>{text.thisDateOnly}</Muted>
        <AttendanceEditor members={members} value={draft} onChange={(next) => edit({ draft: next })} memberExtra={memberExtra} />
        <StepperField label={text.guests} helper={text.guestsHelper} value={guests} min={MIN_GUESTS} max={MAX_GUESTS} onChange={(n) => edit({ guests: clampGuests(n) })} />
        <Muted>{portionsPreviewText(portionsPreview(members, draft, guests))}</Muted>
        {empty ? <Muted>{text.emptiedNote}</Muted> : null}
        {showCourses ? (
          <DateCoursesSection
            drafts={courseDrafts}
            members={attendees}
            disabled={saving}
            onToggle={(courseId, memberId, eats) => edit({ courseDrafts: withDateEater(courseDrafts, courseId, memberId, eats) })}
            onReset={(courseId) => edit({ courseDrafts: resetDateCourse(courseDrafts, courseId, usualOptOuts(courseId)) })}
          />
        ) : null}
      </div>
    </BottomSheet>
  )
}
