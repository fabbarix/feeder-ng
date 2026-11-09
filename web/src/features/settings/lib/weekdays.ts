export const WEEKDAYS: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
]

export function weekdayName(id: number): string {
  return WEEKDAYS.find((d) => d.id === id)?.name ?? ''
}

/** ISO weekday (1 Monday .. 7 Sunday) of a YYYY-MM-DD date, or null when it is not a real date. */
export function weekdayOfDate(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  const dow = dt.getUTCDay()
  return dow === 0 ? 7 : dow
}

/** The first date on or after `from` (YYYY-MM-DD) that falls on `weekday`. */
export function nextDateForWeekday(weekday: number, from: string): string {
  const start = weekdayOfDate(from)
  if (start === null) return from
  const ahead = (weekday - start + 7) % 7
  const [y, mo, d] = from.split('-').map(Number) as [number, number, number]
  return isoOf(new Date(Date.UTC(y, mo - 1, d + ahead)))
}

function isoOf(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

/** Today's date in the browser's local time, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
