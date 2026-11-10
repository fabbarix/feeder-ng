/** All dates are ISO "YYYY-MM-DD" strings in local calendar terms (no time zones). */
export function parseIsoDate(_iso: string): { year: number; month: number; day: number } | null {
  throw new Error('not implemented')
}
export function toIsoDate(_year: number, _month: number, _day: number): string {
  throw new Error('not implemented')
}
export function addDays(_iso: string, _days: number): string {
  throw new Error('not implemented')
}
/** Adds months, clamping the day: 2027-01-31 + 1 -> 2027-02-28. */
export function addMonths(_iso: string, _months: number): string {
  throw new Error('not implemented')
}
export interface CalendarDay {
  iso: string
  day: number
  /** In the displayed month. */
  inMonth: boolean
}
/** Weeks (Monday first) covering the month, only as many as needed (4 to 6). month is 1..12. */
export function monthMatrix(_year: number, _month: number): CalendarDay[][] {
  throw new Error('not implemented')
}
