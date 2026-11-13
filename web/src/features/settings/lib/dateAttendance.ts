// B5-F1 (ADR 0014): the Guests and the emptied-date rules of the Who's eating sheet. Plain TypeScript, no React.
import type { AttendanceEntry, Member } from '../types'

export const MIN_GUESTS = 0
export const MAX_GUESTS = 20

/** A Guests count as the stepper allows it: a whole number from 0 to 20 (anything else is clamped; not a number is 0). */
export function clampGuests(_n: number): number {
  return 0
}

/** Portions of each Course the sheet previews: the Members' effective Portion Factors plus one per Guest. */
export function portionsPreview(_members: Member[], _attendance: AttendanceEntry[], _guests: number): number {
  return 0
}

/** "6 portions of each Course", "1 portion of each Course" (the number via formatPortionsNeeded). */
export function portionsPreviewText(_portions: number): string {
  return ''
}

/** U1: a save with no Member and no Guest makes the date Not served. */
export function emptiesDate(_attendance: AttendanceEntry[], _guests: number): boolean {
  return false
}

/**
 * Does this save empty the date? `attendance` and `guests` are what the sheet sends (undefined = left as it is); `current` is the
 * date as the server has it (undefined while unknown) and `usual` the slot's usual Attendance. Only a save that sends Members or Guests
 * can empty a date: a Courses-only save never does, even when the usual Attendance is empty.
 */
export function savingEmptiesDate(
  _sent: { attendance?: AttendanceEntry[]; guests?: number },
  _current: { attendance: AttendanceEntry[]; guests?: number } | undefined,
  _usual: AttendanceEntry[],
): boolean {
  return false
}

/** "2 Guests", "1 Guest", '' for none. */
export function guestsLabel(_guests: number): string {
  return ''
}
