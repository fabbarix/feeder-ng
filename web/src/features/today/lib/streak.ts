import { todayStrings } from '../strings'

export interface StreakMetric {
  /** B9-44 (TB-08): the big number, days only: "12 d" (Today and the board say the same number). */
  value: string
  /** The accessible name, the unit spelled out: "12 days", "1 day". */
  name: string
  /** Always "zero-waste streak". */
  label: string
}

export function streakMetric(days: number): StreakMetric {
  return { value: `${days} d`, name: todayStrings.streakDays(days), label: todayStrings.streakLabel }
}
