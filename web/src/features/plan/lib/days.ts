import type { PlanSlot } from '../types'

export interface DayGroup {
  date: string
  /** "Today", "Tomorrow", "Yesterday", otherwise "Wed 11 Nov". */
  label: string
  isToday: boolean
  /** Grid columns the day tile spans: both columns (2) for today, otherwise 1. */
  span: 1 | 2
  slots: PlanSlot[]
}

/** Groups slots by date, chronologically (slots inside a day by time, then Meal Slot id). */
export function groupByDay(slots: PlanSlot[], today: string): DayGroup[] {
  void [slots, today]
  throw new Error('TODO: developer')
}

/** The first slot, from now on, that has a Planned Meal still to cook (state planned, At >= now), or null. */
export function nextMeal(slots: PlanSlot[], now: Date): PlanSlot | null {
  void [slots, now]
  throw new Error('TODO: developer')
}
