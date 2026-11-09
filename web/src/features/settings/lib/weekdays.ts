export const WEEKDAYS: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
]

export function weekdayName(_id: number): string {
  throw new Error('not implemented')
}

/** ISO weekday (1 Monday .. 7 Sunday) of a YYYY-MM-DD date, or null when it is not a real date. */
export function weekdayOfDate(_date: string): number | null {
  throw new Error('not implemented')
}

/** The first date on or after `from` (YYYY-MM-DD) that falls on `weekday`. */
export function nextDateForWeekday(_weekday: number, _from: string): string {
  throw new Error('not implemented')
}

/** Today's date in the browser's local time, as YYYY-MM-DD. */
export function todayIso(_now?: Date): string {
  throw new Error('not implemented')
}
