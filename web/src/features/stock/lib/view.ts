import type { IngredientStock, StockLot } from '../types'

export type GoOffTone = 'spoil' | 'neutral'
export interface GoOffDescription {
  label: string
  tone: GoOffTone
}

const DAY_MS = 86_400_000

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Whole days from a to b (YYYY-MM-DD), DST-safe. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS)
}

/** The part of a Stock Lot that go-off wording needs; `spoiled` and `useSoon` are the server's flags. */
export type GoOffLot = Pick<StockLot, 'goesOff' | 'spoiled' | 'useSoon'>

/**
 * Words for a lot's go-off date relative to today (the household's date from the
 * server, YYYY-MM-DD): null -> "No go-off date"; past -> "Went off today" (go-off date
 * yesterday, §6.1) / "Went off yesterday" / "Went off 3 days ago"; 0 -> "Goes off today"; 1 -> "Goes off tomorrow";
 * further -> "Goes off in 12 days". The tone is "spoil" when the server flags the
 * lot `spoiled` or `useSoon`, otherwise "neutral"; the use-soon window is the
 * server's rule and is not repeated here.
 */
export function describeGoOff(lot: GoOffLot, today: string): GoOffDescription {
  const tone: GoOffTone = lot.spoiled || lot.useSoon ? 'spoil' : 'neutral'
  if (lot.goesOff === null) return { label: 'No go-off date', tone }
  const n = daysBetween(today, lot.goesOff)
  // §6.1: a Lot goes off the day after its go-off date, so the date n days back went off n - 1 days ago.
  if (n < 0) return { label: n === -1 ? 'Went off today' : n === -2 ? 'Went off yesterday' : `Went off ${-n - 1} days ago`, tone }
  if (n === 0) return { label: 'Goes off today', tone }
  if (n === 1) return { label: 'Goes off tomorrow', tone }
  return { label: `Goes off in ${n} days`, tone }
}

/** Ingredients with spoiled Stock Lots first, then use-soon, then by name (case-insensitive). Does not mutate. */
export function sortTotals(items: IngredientStock[]): IngredientStock[] {
  const rank = (i: IngredientStock) => (i.spoiledCount > 0 ? 0 : i.useSoon ? 1 : 2)
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}
