import type { IngredientStock } from '../types'

export type GoOffTone = 'spoil' | 'neutral'
export interface GoOffDescription {
  label: string
  tone: GoOffTone
}

/** Days within which a lot counts as "use soon" (matches the server's stock.UseSoonDays). */
export const USE_SOON_DAYS = 3

const DAY_MS = 86_400_000

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Whole days from a to b (YYYY-MM-DD), DST-safe. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS)
}

/**
 * Words for a go-off date relative to today (both YYYY-MM-DD):
 * null -> "No go-off date" (neutral); past -> "Went off yesterday" / "Went off 3 days ago" (spoil);
 * 0 -> "Goes off today"; 1 -> "Goes off tomorrow"; 2..3 -> "Goes off in 3 days" (spoil);
 * further -> "Goes off in 12 days" (neutral).
 */
export function describeGoOff(goesOff: string | null, today: string): GoOffDescription {
  if (goesOff === null) return { label: 'No go-off date', tone: 'neutral' }
  const n = daysBetween(today, goesOff)
  if (n < 0) return { label: n === -1 ? 'Went off yesterday' : `Went off ${-n} days ago`, tone: 'spoil' }
  if (n === 0) return { label: 'Goes off today', tone: 'spoil' }
  if (n === 1) return { label: 'Goes off tomorrow', tone: 'spoil' }
  const tone: GoOffTone = n <= USE_SOON_DAYS ? 'spoil' : 'neutral'
  return { label: `Goes off in ${n} days`, tone }
}

/** Ingredients with spoiled Stock Lots first, then use-soon, then by name (case-insensitive). Does not mutate. */
export function sortTotals(items: IngredientStock[]): IngredientStock[] {
  const rank = (i: IngredientStock) => (i.spoiledCount > 0 ? 0 : i.useSoon ? 1 : 2)
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}
