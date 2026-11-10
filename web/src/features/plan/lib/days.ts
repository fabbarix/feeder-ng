import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { dayNumber, weekdayName } from './phrase'

export interface DayGroup {
  date: string
  /** "Today", "Tomorrow", "Yesterday", otherwise "Wed 11 Nov". */
  label: string
  /** WP6: heading of the day tile, "Today", "Tomorrow", "Yesterday", otherwise the long weekday ("Wednesday"). */
  title: string
  /** WP6: the date overline of the tile, "WED 11". */
  overline: string
  isToday: boolean
  /** Grid columns the day tile spans: both columns (2) for today, otherwise 1. */
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

/** Groups slots by date, chronologically (slots inside a day by time, then Meal Slot id). */
export function groupByDay(slots: PlanSlot[], today: string): DayGroup[] {
  const byDate = new Map<string, PlanSlot[]>()
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  return [...byDate.keys()]
    .sort()
    .map((date) => {
      const isToday = date === today
      return {
        date,
        label: labelFor(date, today),
        title: labelFor(date, today),
        overline: '',
        isToday,
        span: isToday ? 2 : 1,
        slots: byDate.get(date)!.sort((a, b) => a.time.localeCompare(b.time) || a.mealSlotId - b.mealSlotId),
      }
    })
}

/** The first slot, from now on, that has a Planned Meal still to cook (state planned, At >= now), or null. */
export function nextMeal(slots: PlanSlot[], now: Date): PlanSlot | null {
  const t = now.getTime()
  const open = slots
    .filter((s) => s.meal?.state === 'planned' && Date.parse(s.at) >= t)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.mealSlotId - b.mealSlotId)
  return open[0] ?? null
}

/** "WED 11": short weekday in capitals and the day of the month. */
export function dayOverline(_date: string): string {
  throw new Error('not implemented (WP6)')
}

/** "9 – 15 Nov", across months "30 Nov – 6 Dec", across years "28 Dec 2026 – 3 Jan 2027". Same day: "9 Nov". */
export function dateRange(_first: string, _last: string): string {
  throw new Error('not implemented (WP6)')
}

/**
 * The Planned Meal the Today hero shows: the first planned meal (state planned) whose slot time is less than two hours
 * past, so it also covers "started, not yet confirmed" (after two hours it belongs to To confirm). Null when none.
 */
export function heroMeal(_slots: PlanSlot[], _now: Date): PlanSlot | null {
  throw new Error('not implemented (WP6)')
}
