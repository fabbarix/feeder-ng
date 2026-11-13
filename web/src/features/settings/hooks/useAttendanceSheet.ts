// B5-F1: everything the Who's eating sheet needs for one Meal Slot on one date, opened from Plan or Today (WhosEatingSheet).
import type { AttendanceEntry, DateAttendance, DateCourseChange, MealSlot, Member } from '../types'

/** The slot and date a Who's eating sheet is open for (the same shape as Plan's SlotDayKey). */
export interface WhosEatingTarget {
  mealSlotId: number
  date: string
}

export interface AttendanceSheetOptions {
  /** Asked before saving an emptied date (no Member, no Guest); false cancels the save. Plan wires the Not served confirm here. */
  beforeEmptying?: (target: WhosEatingTarget) => Promise<boolean>
  /** Called after an emptied date was saved (instead of the "Attendance saved" toast): Plan shows "Thu Dinner is not served" with Undo. */
  onEmptied?: (target: WhosEatingTarget) => void
  /** Called after any save or reset that closed the sheet. */
  onClose: () => void
}

export interface AttendanceSheetState {
  /** The Meal Slot and Members have loaded (the sheet renders once they have). */
  ready: boolean
  slot: MealSlot | undefined
  members: Member[]
  attendance: DateAttendance | undefined
  saving: boolean
  /** The sheet's Save: confirms an emptied date first, PUTs, toasts, closes. Resolves false when cancelled or failed (an error toast). */
  save: (attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number) => Promise<boolean>
  reset: () => Promise<boolean>
}

/** `target` null = closed: no request is made. */
export function useAttendanceSheet(_target: WhosEatingTarget | null, _options: AttendanceSheetOptions): AttendanceSheetState {
  return { ready: false, slot: undefined, members: [], attendance: undefined, saving: false, save: async () => false, reset: async () => false }
}
