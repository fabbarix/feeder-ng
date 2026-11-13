// B5-F1: everything the Who's eating sheet needs for one Meal Slot on one date, opened from Plan or Today (WhosEatingSheet).
import { useQuery } from '@tanstack/react-query'
import { useToast } from '../../../ui'
import { settingsApi } from '../api'
import { savingEmptiesDate } from '../lib/dateAttendance'
import { errorMessage } from '../lib/errors'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, DateAttendance, DateCourseChange, MealSlot, Member } from '../types'
import { settingsKeys } from './queryKeys'
import { useAttendance } from './useAttendance'

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

const NO_MEMBERS: Member[] = []

/** `target` null = closed: no request is made. */
export function useAttendanceSheet(target: WhosEatingTarget | null, options: AttendanceSheetOptions): AttendanceSheetState {
  const toast = useToast()
  const open = target !== null
  const slots = useQuery({ queryKey: settingsKeys.slots, queryFn: settingsApi.listMealSlots, enabled: open })
  const members = useQuery({ queryKey: settingsKeys.members, queryFn: settingsApi.listMembers, enabled: open })
  const att = useAttendance(target?.mealSlotId ?? null, target?.date ?? null)
  const slot = target ? slots.data?.find((s) => s.id === target.mealSlotId) : undefined
  const ready = open && slot !== undefined && members.data !== undefined && att.attendance !== undefined

  const close = () => options.onClose()

  const save = async (attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number): Promise<boolean> => {
    if (!target || !slot) return false
    if (savingEmptiesDate({ attendance, guests }, att.attendance, slot.attendance)) {
      if (options.beforeEmptying && !(await options.beforeEmptying(target))) return false
      try {
        await att.save(attendance, courses, guests)
      } catch (err) {
        toast.show(errorMessage(err, slot.name), { status: 'error' })
        return false
      }
      options.onEmptied?.(target)
      close()
      return true
    }
    try {
      await att.save(attendance, courses, guests)
      toast.show(settingsStrings.attendanceSaved, { status: 'success' })
      close()
      return true
    } catch (err) {
      toast.show(errorMessage(err, slot.name), { status: 'error' })
      return false
    }
  }

  const reset = async (): Promise<boolean> => {
    if (!target) return false
    try {
      await att.reset()
      toast.show(settingsStrings.attendanceReset, { status: 'success' })
      close()
      return true
    } catch (err) {
      toast.show(errorMessage(err, slot?.name), { status: 'error' })
      return false
    }
  }

  return {
    ready,
    slot,
    members: members.data ?? NO_MEMBERS,
    attendance: att.attendance,
    saving: att.saving,
    save,
    reset,
  }
}
