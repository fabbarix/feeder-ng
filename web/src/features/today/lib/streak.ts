import { todayStrings } from '../strings'

export interface StreakMetric {
  /** The big number: "3 wk" from 7 days on (whole weeks), otherwise "5 d". */
  value: string
  /** Always "zero-waste streak". */
  label: string
}

export function streakMetric(days: number): StreakMetric {
  const value = days >= 7 ? `${Math.floor(days / 7)} wk` : `${days} d`
  return { value, label: todayStrings.streakLabel }
}
