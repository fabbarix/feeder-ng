import { shortWeekday, shortMonth, dayOfMonth } from './dates'

/** "Tue 10 Nov" from a household date (YYYY-MM-DD): the subtitle under the Today title. */
export function todayHeading(date: string): string {
  return `${shortWeekday(date)} ${dayOfMonth(date)} ${shortMonth(date)}`
}
