import { weekdayName, weekdayOfDate } from './weekdays'

/** Why a date cannot hold Attendance for a Meal Slot on `weekday`, or null when it can. */
export function dateProblem(weekday: number, date: string): string | null {
  const actual = weekdayOfDate(date)
  if (actual === null) return 'Pick a valid date.'
  if (actual !== weekday) return `${date} is not a ${weekdayName(weekday)}`
  return null
}

/**
 * B9-38 (PC-10, SHORT-02): the context line of the Who's eating sheet opened from Plan and Today: "Thu 12 Nov · Dinner" (the short
 * weekday, the day and month, then the Meal Slot). Never an ISO date.
 */
export function whosEatingContext(_date: string, _slotName: string): string {
  throw new Error('whosEatingContext: not implemented (B9-38)')
}
