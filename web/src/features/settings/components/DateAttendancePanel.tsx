import type { AttendanceEntry, DateAttendance, MealSlot, Member } from '../types'

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

/** A BottomSheet "<name> on <date>": date input "Date", AttendanceEditor, "Save for this date",
 *  "Reset to usual Attendance" (enabled only for an override); warns when the date is not on the slot's weekday. */
export function DateAttendancePanel(_props: DateAttendancePanelProps) {
  return null
}
