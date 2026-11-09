// What Cook Mode says about Advance Steps. Plain TypeScript, no React.
import type { AdvanceItem } from '../types'

export interface AdvanceSummary {
  done: AdvanceItem[]
  /** Not done: these show a warning. */
  pending: AdvanceItem[]
}

/** Splits into done and pending, keeping the Recipe's order. */
export function advanceSummary(_items: AdvanceItem[]): AdvanceSummary {
  throw new Error('TODO')
}

/** "30 min", "4 h", "1 h 30 min", "2 days" (24 h or more, rounded down to whole days, with the hours left over when not whole: "1 day 6 h"). */
export function formatLeadTime(_minutes: number): string {
  throw new Error('TODO')
}
