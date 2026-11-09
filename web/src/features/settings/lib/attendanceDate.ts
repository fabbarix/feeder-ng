import { weekdayName, weekdayOfDate } from './weekdays'

/** Why a date cannot hold Attendance for a Meal Slot on `weekday`, or null when it can. */
export function dateProblem(weekday: number, date: string): string | null {
  const actual = weekdayOfDate(date)
  if (actual === null) return 'Pick a valid date.'
  if (actual !== weekday) return `${date} is not a ${weekdayName(weekday)}`
  return null
}
