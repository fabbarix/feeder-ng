import type { IngredientStock } from '../../stock/types'
import { todayStrings } from '../strings'
import type { UseSoonItem } from '../types'

const DAY_MS = 86_400_000

/** Whole days from one household date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Go-off wording for a whole number of days from today, "Goes off today" to "Goes off in N days". */
export function goesOffWording(days: number): string {
  if (days === 0) return todayStrings.goesOffToday
  if (days === 1) return todayStrings.goesOffTomorrow
  return todayStrings.goesOffIn(days)
}

/**
 * The Ingredients to use soon: stock flagged useSoon whose soonest go-off is still
 * ahead (spoiled lots belong to the spoiled tile). Soonest first, then by name.
 */
export function useSoonItems(totals: IngredientStock[], today: string): UseSoonItem[] {
  const rows: Array<UseSoonItem & { days: number }> = []
  for (const t of totals) {
    if (!t.useSoon || !t.nextGoesOff) continue
    const days = daysBetween(today, t.nextGoesOff)
    if (days < 0) continue
    rows.push({ ingredientId: t.ingredientId, name: t.name, when: goesOffWording(days), days })
  }
  rows.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
  return rows.map(({ days: _days, ...item }) => item)
}

export interface UseSoonSplit {
  rows: UseSoonItem[]
  /** Items beyond the first `max`; the tile says "+2 more". */
  more: number
}

export function splitUseSoon(_items: UseSoonItem[], _max = 3): UseSoonSplit {
  throw new Error('not implemented (WP6)')
}
