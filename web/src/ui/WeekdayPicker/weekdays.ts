// Weekday helpers for the WeekdayPicker and the Meal Slot summaries. ISO weekdays: 1 Monday .. 7 Sunday.
// STUB (R15 step 2): implement with Intl.DateTimeFormat on a fixed UTC date (2024-01-01 is a Monday).
export type WeekStart = 1 | 6 | 7

/** The seven ISO weekdays starting at `weekStart` (default Monday): weekdayOrder(7) is [7,1,2,3,4,5,6]. */
export function weekdayOrder(_weekStart: WeekStart = 1): number[] {
  throw new Error('not implemented')
}
/** "Mon" / "lun" for locale 'it'. */
export function weekdayShortName(_day: number, _locale = 'en'): string {
  throw new Error('not implemented')
}
/** "Monday" / "lunedì" for locale 'it'. */
export function weekdayLongName(_day: number, _locale = 'en'): string {
  throw new Error('not implemented')
}
/** Ascending, de-duplicated ISO weekdays; values outside 1..7 are dropped. */
export function sortIsoDays(_days: number[]): number[] {
  throw new Error('not implemented')
}
