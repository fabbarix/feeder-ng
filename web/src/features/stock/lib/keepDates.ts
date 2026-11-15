// B9-29 (SSP-17, decision SSP 8): the choices of the Keep date sheet ("Flour: good until?"), as pure rules (no React).
import { daysBetween } from './days'

export type KeepChoiceId = 'today' | 'tomorrow' | 'in3' | 'week'

export interface KeepChoice {
  id: KeepChoiceId
  label: string
  /** YYYY-MM-DD */
  date: string
  /** "Tue 10 Nov" */
  dayLabel: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parse(iso: string): Date | null {
  if (!ISO.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The day `n` days after `today` (YYYY-MM-DD). */
export function addDays(today: string, n: number): string {
  const d = parse(today)
  if (!d) return today
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** "Thu 12 Nov" */
export function keepDayLabel(date: string): string {
  const d = parse(date)
  if (!d) return date
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** The chip's short day, "Thu 12" (the radio's name carries the full "Thu 12 Nov"). */
export function keepShortDay(date: string): string {
  const d = parse(date)
  if (!d) return date
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

const CHOICES: Array<{ id: KeepChoiceId; label: string; days: number }> = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'in3', label: 'In 3 days', days: 3 },
  { id: 'week', label: 'In a week', days: 7 },
]

/** Today, Tomorrow, In 3 days and In a week, each with its date. */
export function keepChoices(today: string): KeepChoice[] {
  return CHOICES.map(({ id, label, days }) => {
    const date = addDays(today, days)
    return { id, label, date, dayLabel: keepDayLabel(date) }
  })
}

/** The primary's words: "Keep until Thu 12 Nov". */
export function keepUntilLabel(date: string): string {
  return `Keep until ${keepDayLabel(date)}`
}

/** A valid ISO day that is not before today. */
export function isKeepDate(date: string, today: string): boolean {
  if (!parse(date) || !parse(today)) return false
  return daysBetween(today, date) >= 0
}
