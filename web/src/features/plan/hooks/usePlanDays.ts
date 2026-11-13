import type { DayGroup } from '../lib/days'
import type { PlanSlot } from '../types'

/** The week of day tiles and its date range, from the plan's slots (no column count: the grid is sized by `min="day"`). Stub. */
export function usePlanDays(_slots: PlanSlot[], _today: string): { days: DayGroup[]; range: string | undefined } {
  throw new Error('ds-plan: usePlanDays is not implemented')
}
