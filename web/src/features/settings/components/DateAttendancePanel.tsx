import { useState } from 'react'
import { BottomSheet, Button, DateField } from '../../../ui'
import { dateProblem } from '../lib/attendanceDate'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateAttendance, DateCourseChange, MealSlot, Member } from '../types'
import { AttendanceEditor } from './AttendanceEditor'
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
      <DateForm key={`${date}|${props.attendance ? props.attendance.isOverride : 'none'}`} {...props} />
    </BottomSheet>
  )
}

function DateForm({ slot, date, attendance, members, saving, onChangeDate, onSave, onReset }: DateAttendancePanelProps) {
  const [draft, setDraft] = useState<AttendanceEntry[]>(() => attendance?.attendance ?? slot.attendance)
  const problem = dateProblem(slot.weekday, date)
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
      <div className="settings__row">
        <Button disabled={problem !== null} loading={saving} onClick={() => void onSave(draft)}>
          {text.saveDate}
        </Button>
        <Button variant="tertiary" disabled={!attendance?.isOverride || saving} onClick={() => void onReset()}>
          {text.resetDate}
        </Button>
      </div>
    </div>
  )
}
