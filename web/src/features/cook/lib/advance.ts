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
