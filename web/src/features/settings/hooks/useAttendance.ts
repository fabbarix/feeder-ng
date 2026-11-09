import type { AttendanceEntry, DateAttendance } from '../types'

export interface AttendanceState {
  attendance: DateAttendance | undefined
  isPending: boolean
  isError: boolean
  /** PUT this date's Attendance; also refreshes Meal Slots. */
  save: (attendance: AttendanceEntry[]) => Promise<DateAttendance>
  /** DELETE the override for this date. */
  reset: () => Promise<void>
  saving: boolean
}

/** Does nothing (no request) while slotId or date is null. */
export function useAttendance(_slotId: number | null, _date: string | null): AttendanceState {
  throw new Error('not implemented')
}
