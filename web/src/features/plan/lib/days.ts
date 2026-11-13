import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { dayNumber, weekdayName } from './phrase'
import { plannedMeals } from './courses'

/** Two hours: the Today hero stays on a Planned Meal this long after its slot time, then To confirm takes over. */
const HERO_GRACE_MS = 2 * 60 * 60 * 1000

export interface DayGroup {
  date: string
  /** "Today", "Tomorrow", "Yesterday", otherwise "Wed 11 Nov". */
  label: string
  /** WP6: heading of the day tile, "Today", "Tomorrow", "Yesterday", otherwise the long weekday ("Wednesday"). */
  title: string
  /** WP6: the date overline of the tile, "WED 11". */
  overline: string
  isToday: boolean
  /** ds-plan: the day tile's title-3, "Thu 12 · Today" / "Fri 13 · Tomorrow" / "Sun 8 · Yesterday", otherwise "Sat 14". Stub (empty until implemented). */
  heading: string
  /** WP6 round 2: the short heading for the compact (7-column) tile: Today / Tomorrow / Yesterday, else "Wed". */
  shortTitle: string
  /** Grid columns the day tile spans: both columns (2) for today, otherwise 1; at 7 columns (a true week) always 1. */
  span: 1 | 2
  slots: PlanSlot[]
}

function labelFor(date: string, today: string): string {
  const diff = dayNumber(date) - dayNumber(today)
  if (diff === 0) return s.today
  if (diff === 1) return s.tomorrow
  if (diff === -1) return s.yesterday
  const [, m, d] = date.split('-').map(Number)
  return s.dayMonth(weekdayName(date, 'short'), d, s.monthsShort[(m ?? 1) - 1]!)
}

/** The day tile heading: Today, Tomorrow, Yesterday, otherwise the long weekday. */
function titleFor(date: string, today: string): string {
  const diff = dayNumber(date) - dayNumber(today)
  if (diff === 0) return s.today
  if (diff === 1) return s.tomorrow
  if (diff === -1) return s.yesterday
  return weekdayName(date)
}

/** Today / Tomorrow / Yesterday, otherwise the short weekday ("Wed"): a heading that never clips in a 7-column tile. */
function shortTitleFor(date: string, today: string): string {
  const diff = dayNumber(date) - dayNumber(today)
  if (diff === 0) return s.today
  if (diff === 1) return s.tomorrow
  if (diff === -1) return s.yesterday
  return weekdayName(date, 'short')
}

/** Groups slots by date, chronologically (slots inside a day by time, then Meal Slot id). columns: the Plan grid's columns. */
export function groupByDay(slots: PlanSlot[], today: string, columns: 2 | 4 | 7 = 2): DayGroup[] {
  const byDate = new Map<string, PlanSlot[]>()
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  return [...byDate.keys()]
    .sort()
    .map((date) => {
      const isToday = date === today
      return {
        date,
        label: labelFor(date, today),
        title: titleFor(date, today),
        shortTitle: shortTitleFor(date, today),
        overline: dayOverline(date),
        isToday,
        heading: '',
        span: isToday && columns !== 7 ? 2 : 1,
        slots: byDate.get(date)!.sort((a, b) => a.time.localeCompare(b.time) || a.mealSlotId - b.mealSlotId),
      }
    })
}

/** The first slot, from now on, that has a Planned Meal still to cook (state planned, At >= now), or null. */
export function nextMeal(slots: PlanSlot[], now: Date): PlanSlot | null {
  const t = now.getTime()
  const open = slots
    .filter((s) => plannedMeals(s).length > 0 && Date.parse(s.at) >= t)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
  return open[0] ?? null
}

/** "WED 11": short weekday in capitals and the day of the month. */
export function dayOverline(date: string): string {
  return `${weekdayName(date, 'short').toUpperCase()} ${dayOfMonth(date)}`
}

function dayOfMonth(date: string): number {
  return Number(date.split('-')[2])
}

function monthOf(date: string): string {
  return s.monthsShort[Number(date.split('-')[1]) - 1] ?? ''
}

function yearOf(date: string): string {
  return date.split('-')[0] ?? ''
}

/** "9 – 15 Nov", across months "30 Nov – 6 Dec", across years "28 Dec 2026 – 3 Jan 2027". Same day: "9 Nov". */
export function dateRange(first: string, last: string): string {
  if (first === last) return `${dayOfMonth(first)} ${monthOf(first)}`
  if (yearOf(first) !== yearOf(last)) {
    return `${dayOfMonth(first)} ${monthOf(first)} ${yearOf(first)} – ${dayOfMonth(last)} ${monthOf(last)} ${yearOf(last)}`
  }
  if (monthOf(first) !== monthOf(last)) return `${dayOfMonth(first)} ${monthOf(first)} – ${dayOfMonth(last)} ${monthOf(last)}`
  return `${dayOfMonth(first)} – ${dayOfMonth(last)} ${monthOf(last)}`
}

/**
 * The Planned Meal the Today hero shows: the first planned meal (state planned) whose slot time is less than two hours
 * past, so it also covers "started, not yet confirmed" (after two hours it belongs to To confirm). Null when none.
 */
export function heroMeal(slots: PlanSlot[], now: Date): PlanSlot | null {
  const t = now.getTime()
  const open = slots
    .filter((s) => plannedMeals(s).length > 0 && Date.parse(s.at) + HERO_GRACE_MS > t)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
  return open[0] ?? null
}
