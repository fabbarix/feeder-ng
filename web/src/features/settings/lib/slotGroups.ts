import type { MealSlot } from '../types'
import { WEEKDAYS } from './weekdays'

export interface WeekdayGroup {
  weekday: number
  name: string
  slots: MealSlot[]
}

/** Slots under their weekday in week order (Monday first), each sorted by time then name; empty weekdays are left out. */
export function groupByWeekday(slots: MealSlot[]): WeekdayGroup[] {
  return WEEKDAYS.map((d) => ({
    weekday: d.id,
    name: d.name,
    slots: slots.filter((s) => s.weekday === d.id).sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name)),
  })).filter((g) => g.slots.length > 0)
}
