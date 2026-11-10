export interface StreakMetric {
  /** The big number: "3 wk" from 7 days on (whole weeks), otherwise "5 d". */
  value: string
  /** Always "zero-waste streak". */
  label: string
}

export function streakMetric(_days: number): StreakMetric {
  throw new Error('not implemented (WP6)')
}
