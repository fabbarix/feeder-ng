// Weekday helpers for the WeekdayPicker and the Meal Slot summaries. ISO weekdays: 1 Monday .. 7 Sunday.
// Names come from Intl.DateTimeFormat on a fixed UTC date (2024-01-01 is a Monday).
export type WeekStart = 1 | 6 | 7

/** The seven ISO weekdays starting at `weekStart` (default Monday): weekdayOrder(7) is [7,1,2,3,4,5,6]. */
export function weekdayOrder(weekStart: WeekStart = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart - 1 + i) % 7) + 1)
}

function name(day: number, locale: string, width: 'short' | 'long'): string {
  const date = new Date(Date.UTC(2024, 0, day)) // 2024-01-01 is a Monday
  try {
    return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { weekday: width, timeZone: 'UTC' }).format(date)
  }
}

/** "Mon" / "lun" for locale 'it'. */
export function weekdayShortName(day: number, locale = 'en'): string {
  return name(day, locale, 'short')
}
/** "Monday" / "lunedì" for locale 'it'. */
export function weekdayLongName(day: number, locale = 'en'): string {
  return name(day, locale, 'long')
}
/** Ascending, de-duplicated ISO weekdays; values outside 1..7 are dropped. */
export function sortIsoDays(days: number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
}
