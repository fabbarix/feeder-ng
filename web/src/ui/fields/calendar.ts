/** All dates are ISO "YYYY-MM-DD" strings in local calendar terms (no time zones). */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function utcFrom(iso: string): Date {
  const parts = parseIsoDate(iso)
  if (!parts) throw new Error(`not an ISO date: ${iso}`)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function isoFromUtc(date: Date): string {
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function addDays(iso: string, days: number): string {
  const date = utcFrom(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoFromUtc(date)
}

/** Adds months, clamping the day: 2027-01-31 + 1 -> 2027-02-28. */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseIsoDate(iso) ?? { year: NaN, month: NaN, day: NaN }
  const total = year * 12 + (month - 1) + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = (total % 12) + 1
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth))
  return toIsoDate(targetYear, targetMonth, clamped)
}

export interface CalendarDay {
  iso: string
  day: number
  /** In the displayed month. */
  inMonth: boolean
}

/** Weeks (Monday first) covering the month, only as many as needed (4 to 6). month is 1..12. */
export function monthMatrix(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const leading = (first.getUTCDay() + 6) % 7 // Monday = 0
  const count = daysInMonth(year, month)
  const weeks: CalendarDay[][] = []
  let week: CalendarDay[] = []
  for (let i = -leading; i < count || week.length > 0; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 + i))
    week.push({ iso: isoFromUtc(date), day: date.getUTCDate(), inMonth: i >= 0 && i < count })
    if (week.length === 7) {
      weeks.push(week)
      week = []
      if (i + 1 >= count) break
    }
  }
  return weeks
}

/** The date a grid key moves focus to (arrows: day and week; PageUp/PageDown: month), or null for other keys. */
export function moveIso(iso: string, key: string): string | null {
  switch (key) {
    case 'ArrowRight':
      return addDays(iso, 1)
    case 'ArrowLeft':
      return addDays(iso, -1)
    case 'ArrowDown':
      return addDays(iso, 7)
    case 'ArrowUp':
      return addDays(iso, -7)
    case 'PageDown':
      return addMonths(iso, 1)
    case 'PageUp':
      return addMonths(iso, -1)
    default:
      return null
  }
}
