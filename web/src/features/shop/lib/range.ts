// The range picker's choices (functional spec §9: from now to a date the User chooses, default today + 7, capped at
// the Planning Horizon). Plain TypeScript, no React.

export interface RangeChoice {
  /** YYYY-MM-DD, the last day of the range */
  to: string
  /** "Today", "Tomorrow", "Thu 12" */
  label: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MAX_CHOICES = 14
const DAY_MS = 86_400_000

/** Whole days from a to b (YYYY-MM-DD, both household dates); negative when b is earlier. */
function daysBetween(a: string, b: string): number {
  return Math.round((parseUtc(b) - parseUtc(a)) / DAY_MS)
}

function parseUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function addDays(date: string, days: number): string {
  const d = new Date(parseUtc(date) + days * DAY_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** One choice per day from today to maxTo inclusive (at most 14). A maxTo before today gives just today. */
export function rangeChoices(today: string, maxTo: string): RangeChoice[] {
  const count = Math.min(Math.max(daysBetween(today, maxTo) + 1, 1), MAX_CHOICES)
  return Array.from({ length: count }, (_, i) => {
    const to = addDays(today, i)
    return { to, label: dayLabel(to, today) }
  })
}

/** "Today" / "Tomorrow" / "Thu 12" for a date relative to today (weekday names are English constants). */
export function dayLabel(date: string, today: string): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  const d = new Date(parseUtc(date))
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** The heading of the range: "Today" for to === today, else "Until tomorrow" / "Until Thu 12". */
export function describeRange(to: string, today: string): string {
  const label = dayLabel(to, today)
  if (label === 'Today') return 'Today'
  if (label === 'Tomorrow') return 'Until tomorrow'
  return `Until ${label}`
}

export interface RangeOption {
  /** YYYY-MM-DD, the last day of the range */
  value: string
  /** describeRange: "Today", "Until tomorrow", "Until Thu 12" (the Select shows it) */
  label: string
}

/** The options of the "Shop for" Select: rangeChoices(today, maxTo), each labelled by describeRange. */
export function rangeOptions(today: string, maxTo: string): RangeOption[] {
  return rangeChoices(today, maxTo).map((choice) => ({ value: choice.to, label: describeRange(choice.to, today) }))
}
