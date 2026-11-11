// Household dates (YYYY-MM-DD) read as calendar parts, independent of the browser's locale and time zone.
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Short weekday of a household date: "Thu". */
export function shortWeekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return SHORT_DAYS[new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay()]!
}

/** Short month of a household date: "Nov". */
export function shortMonth(date: string): string {
  return SHORT_MONTHS[Number(date.split('-')[1]) - 1] ?? ''
}

/** Day of the month of a household date, without a leading zero. */
export function dayOfMonth(date: string): number {
  return Number(date.split('-')[2])
}

/** The device's calendar date as YYYY-MM-DD: Today's fallback while the household date is not known (offline). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
