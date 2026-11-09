import { useState } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { dateProblem } from '../lib/attendanceDate'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateAttendance, MealSlot, Member } from '../types'
import { AttendanceEditor } from './AttendanceEditor'
import { Field } from './Field'
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
  onSave: (attendance: AttendanceEntry[]) => void | Promise<void>
  onReset: () => void | Promise<void>
  onClose: () => void
}

const text = settingsStrings.attendance

/** A BottomSheet "<name> on <date>": date input "Date", AttendanceEditor, "Save for this date",
 *  "Reset to usual Attendance" (enabled only for an override); warns when the date is not on the slot's weekday. */
export function DateAttendancePanel(props: DateAttendancePanelProps) {
  const { open, slot, date, attendance, onClose } = props
  return (
    <BottomSheet open={open} onClose={onClose} title={text.dateTitle(slot.name, date)}>
      {/* A new draft whenever the server's answer for the date changes. */}
      <DateForm key={`${date}|${attendance ? attendance.isOverride : 'none'}`} {...props} />
    </BottomSheet>
  )
}

function DateForm({ slot, date, attendance, members, saving, onChangeDate, onSave, onReset }: DateAttendancePanelProps) {
  const [draft, setDraft] = useState<AttendanceEntry[]>(() => attendance?.attendance ?? slot.attendance)
  const problem = dateProblem(slot.weekday, date)
  return (
    <div className="settings__stack">
      <Field label={text.date} error={problem ?? undefined}>
        {(c) => <input {...c} type="date" value={date} onChange={(e) => onChangeDate(e.target.value)} />}
      </Field>
      <p className="settings__muted">{text.thisDateOnly}</p>
      <AttendanceEditor members={members} value={draft} onChange={setDraft} />
      <div className="settings__row">
        <Button disabled={problem !== null} loading={saving} onClick={() => void onSave(draft)}>
          {text.saveDate}
        </Button>
        <Button variant="ghost" disabled={!attendance?.isOverride || saving} onClick={() => void onReset()}>
          {text.resetDate}
        </Button>
      </div>
    </div>
  )
}
