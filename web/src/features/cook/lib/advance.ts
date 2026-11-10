// What Cook Mode says about Advance Steps. Plain TypeScript, no React.
import type { AdvanceItem } from '../types'

export interface AdvanceSummary {
  done: AdvanceItem[]
  /** Not done: these show a warning. */
  pending: AdvanceItem[]
}

/** Splits into done and pending, keeping the Recipe's order. */
export function advanceSummary(items: AdvanceItem[]): AdvanceSummary {
  return { done: items.filter((i) => i.done), pending: items.filter((i) => !i.done) }
}

/** "30 min", "4 h", "1 h 30 min", "2 days" (24 h or more, rounded down to whole days, with the hours left over when not whole: "1 day 6 h"). */
export function formatLeadTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  if (total < 1440) {
    const hours = Math.floor(total / 60)
    const rest = total % 60
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  }
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const dayText = days === 1 ? '1 day' : `${days} days`
  return hours === 0 ? dayText : `${dayText} ${hours} h`
}

/**
 * The Advance Steps Cook Mode shows on the screen at a given Step: only before Step 1 (index 0), and only what is
 * still pending. From Step 1 on, or once everything is done, nothing is shown.
 */
export function advanceOnScreen(summary: AdvanceSummary, stepIndex: number): AdvanceSummary {
  if (stepIndex !== 0) return { done: [], pending: [] }
  return summary
}
