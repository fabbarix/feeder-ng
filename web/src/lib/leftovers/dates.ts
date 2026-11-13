// Pure date helpers for Leftover copy: YYYY-MM-DD strings, UTC arithmetic, no browser time zone.

const DAY_MS = 86_400_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function utc(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** The date n days after `date` (n may be negative). */
export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `b` to `a` (a - b). */
export function dayDiff(a: string, b: string): number {
  return Math.round((utc(a) - utc(b)) / DAY_MS)
}

/** "Tue". */
export function weekdayShort(date: string): string {
  return WEEKDAYS[new Date(utc(date)).getUTCDay()]!
}

/** "9 Feb". */
export function shortDate(date: string): string {
  const d = new Date(utc(date))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "today", "tomorrow", a short weekday within 6 days either way, else "9 Feb". */
export function dateWord(date: string, today: string): string {
  const diff = dayDiff(date, today)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (Math.abs(diff) <= 6) return weekdayShort(date)
  return shortDate(date)
}
