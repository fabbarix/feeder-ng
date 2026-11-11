import type { MealSlot } from '../types'
import { weekdayOrder, type WeekStart } from '../../../ui/WeekdayPicker/weekdays'

export interface WeekGridModel {
  days: number[]
  rows: { name: string; cells: (MealSlot | null)[] }[]
}
const key = (name: string) => name.trim().toLowerCase()

/** Rows: Meal Slot names (case-insensitive), earliest usual time first, then name. Cells follow `days`. */
export function weekGrid(slots: MealSlot[], weekStart: WeekStart = 1): WeekGridModel {
  const days = weekdayOrder(weekStart)
  const byName = new Map<string, { name: string; earliest: string; slots: MealSlot[] }>()
  for (const s of slots) {
    const k = key(s.name)
    const row = byName.get(k)
    if (!row) byName.set(k, { name: s.name.trim(), earliest: s.time, slots: [s] })
    else {
      row.slots.push(s)
      if (s.time < row.earliest) row.earliest = s.time
    }
  }
  const rows = [...byName.values()]
    .sort((a, b) => a.earliest.localeCompare(b.earliest) || a.name.localeCompare(b.name))
    .map((r) => ({ name: r.name, cells: days.map((d) => r.slots.find((s) => s.weekday === d) ?? null) }))
  return { days, rows }
}
