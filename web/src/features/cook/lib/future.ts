// PC-12: a meal on a future date explains why its last Step offers no Mark as Cooked. Plain TypeScript, no React.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function parse(date: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function dayNumber(date: string): number | null {
  const p = parse(date)
  if (!p) return null
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000)
}

/** The meal's date is after the household's today (both YYYY-MM-DD). An empty today is not future. */
export function isFutureMeal(date: string, today: string): boolean {
  const a = dayNumber(date)
  const b = dayNumber(today)
  if (a === null || b === null) return false
  return a > b
}

/** "Mon 16": the short weekday and the day of the month. */
export function dayLabel(date: string): string {
  const p = parse(date)
  if (!p) return ''
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  return `${WEEKDAYS[wd]} ${p.d}`
}

/** The held line on the last Step of a future meal; '' for a meal that may be marked. */
export function futureLine(date: string, today: string): string {
  if (!isFutureMeal(date, today)) return ''
  const day = dayLabel(date)
  const when = dayNumber(date)! - dayNumber(today)! === 1 ? 'tomorrow' : day
  return `This meal is for ${when}. Mark it Cooked from ${day}, on Today or the Plan.`
}

/** The slot name with its day when the meal is in the future: "Mon 16 Dinner"; today's and past meals keep "Dinner". */
export function dayTitle(name: string, date: string, today: string): string {
  return isFutureMeal(date, today) ? `${dayLabel(date)} ${name}` : name
}
