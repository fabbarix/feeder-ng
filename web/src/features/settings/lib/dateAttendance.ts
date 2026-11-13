// B5-F1 (ADR 0014): the Guests and the emptied-date rules of the Who's eating sheet. Plain TypeScript, no React.
import { settingsStrings } from '../strings'
import type { AttendanceEntry, Member } from '../types'
import { formatPortionsNeeded, portionsNeeded } from './portions'

export const MIN_GUESTS = 0
export const MAX_GUESTS = 20

const text = settingsStrings.attendance

/** A Guests count as the stepper allows it: a whole number from 0 to 20 (anything else is clamped; not a number is 0). */
export function clampGuests(n: number): number {
  if (Number.isNaN(n)) return MIN_GUESTS
  return Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Math.round(n)))
}

/** Portions of each Course the sheet previews: the Members' effective Portion Factors plus one per Guest. */
export function portionsPreview(members: Member[], attendance: AttendanceEntry[], guests: number): number {
  return portionsNeeded(members, attendance) + guests
}

/** "6 portions of each Course", "1 portion of each Course" (the number via formatPortionsNeeded). */
export function portionsPreviewText(portions: number): string {
  return text.portionsPreview(formatPortionsNeeded(portions))
}

/** U1: a save with no Member and no Guest makes the date Not served. */
export function emptiesDate(attendance: AttendanceEntry[], guests: number): boolean {
  return attendance.length === 0 && guests === 0
}

/**
 * Does this save empty the date? `attendance` and `guests` are what the sheet sends (undefined = left as it is); `current` is the
 * date as the server has it (undefined while unknown) and `usual` the slot's usual Attendance. Only a save that sends Members or Guests
 * can empty a date: a Courses-only save never does, even when the usual Attendance is empty.
 */
export function savingEmptiesDate(
  sent: { attendance?: AttendanceEntry[]; guests?: number },
  current: { attendance: AttendanceEntry[]; guests?: number } | undefined,
  usual: AttendanceEntry[],
): boolean {
  if (sent.attendance === undefined && sent.guests === undefined) return false
  const attendance = sent.attendance ?? current?.attendance ?? usual
  const guests = sent.guests ?? current?.guests ?? 0
  return emptiesDate(attendance, guests)
}

/** "2 Guests", "1 Guest", '' for none. */
export function guestsLabel(guests: number): string {
  return guests > 0 ? settingsStrings.slot.guests(guests) : ''
}
