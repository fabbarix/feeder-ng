import type { PlanSlot } from '../types'
import { dayNumber, weekdayName } from './phrase'

export interface DayGroup {
  date: string
  /** "Today", "Tomorrow", "Yesterday", otherwise "Wed 11 Nov". */
  label: string
  isToday: boolean
  /** Grid columns the day tile spans: both columns (2) for today, otherwise 1. */
  span: 1 | 2
  slots: PlanSlot[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function labelFor(date: string, today: string): string {
  const diff = dayNumber(date) - dayNumber(today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const [, m, d] = date.split('-').map(Number)
  return `${weekdayName(date, 'short')} ${d} ${MONTHS[(m ?? 1) - 1]}`
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
