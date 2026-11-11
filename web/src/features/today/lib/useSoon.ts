import type { IngredientStock } from '../../stock/types'
import { todayStrings } from '../strings'
import type { UseSoonItem } from '../types'
import { shortWeekday } from './dates'

const DAY_MS = 86_400_000

/** Whole days from one household date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** The short row wording of the last good day: "good until today", "good until tomorrow", otherwise "good until Thu". */
export function whenWording(date: string, today: string): string {
  const days = daysBetween(today, date)
  if (days <= 0) return todayStrings.goodUntil.today
  if (days === 1) return todayStrings.goodUntil.tomorrow
  return todayStrings.goodUntil.on(shortWeekday(date))
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
    rows.push({ ingredientId: t.ingredientId, name: t.name, when: whenWording(t.nextGoesOff, today), days })
  }
  rows.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
  return rows.map(({ days: _days, ...item }) => item)
}

export interface UseSoonSplit {
  rows: UseSoonItem[]
  /** Items beyond the first `max`; the tile says "+2 more". */
  more: number
}

/** The first `max` rows of the Use soon tile and how many more there are. */
export function splitUseSoon(items: UseSoonItem[], max = 3): UseSoonSplit {
  return { rows: items.slice(0, max), more: Math.max(0, items.length - max) }
}
