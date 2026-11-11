import type { MealSlot } from '../types'
import type { WeekStart } from '../../../ui/WeekdayPicker/weekdays'

export interface WeekGridModel {
  days: number[]
  rows: { name: string; cells: (MealSlot | null)[] }[]
}
/** STUB (R15 step 2). Rows: Meal Slot names (case-insensitive), earliest usual time first, then name. Cells follow `days`. */
export function weekGrid(_slots: MealSlot[], _weekStart: WeekStart = 1): WeekGridModel {
  throw new Error('not implemented')
}
