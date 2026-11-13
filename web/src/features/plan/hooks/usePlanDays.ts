import { useMemo } from 'react'
import { dateRange, groupByDay, type DayGroup } from '../lib/days'
import type { PlanSlot } from '../types'

/** The week of day tiles and its date range, from the plan's slots (no column count: the grid is sized by `min="day"`). */
export function usePlanDays(slots: PlanSlot[], today: string): { days: DayGroup[]; range: string | undefined } {
  return useMemo(() => {
    const days = groupByDay(slots, today)
    const range = days.length > 0 ? dateRange(days[0]!.date, days[days.length - 1]!.date) : undefined
    return { days, range }
  }, [slots, today])
}
