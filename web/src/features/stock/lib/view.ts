import type { IngredientStock, StockLot } from '../types'
import { goOffPhrase } from './filter'
import { daysBetween } from './days'

export { daysBetween }

export type GoOffTone = 'spoil' | 'neutral'
export interface GoOffDescription {
  label: string
  tone: GoOffTone
}

/** The part of a Stock Lot that go-off wording needs; `spoiled` and `useSoon` are the server's flags. */
export type GoOffLot = Pick<StockLot, 'goesOff' | 'spoiled' | 'useSoon'>

/**
 * Words for a lot's go-off date relative to today (the household's date from the
 * server, YYYY-MM-DD): null -> "No go-off date"; forward -> "Good until today" /
 * "Good until tomorrow" / "Good until Thu" / "Good until 16 Nov" (the go-off date is the
 * last good day, §6.1); past -> "Went off today" / "Went off yesterday" / "Went off 3 days ago".
 * The wording is goOffPhrase, capitalised. The tone is "spoil" when the server flags the
 * lot `spoiled` or `useSoon`, otherwise "neutral"; the use-soon window is the
 * server's rule and is not repeated here.
 */
export function describeGoOff(lot: GoOffLot, today: string): GoOffDescription {
  const tone: GoOffTone = lot.spoiled || lot.useSoon ? 'spoil' : 'neutral'
  if (lot.goesOff === null) return { label: 'No go-off date', tone }
  const phrase = goOffPhrase(lot.goesOff, today)
  return { label: phrase.charAt(0).toUpperCase() + phrase.slice(1), tone }
}

/** Ingredients with spoiled Stock Lots first, then use-soon, then by name (case-insensitive). Does not mutate. */
export function sortTotals(items: IngredientStock[]): IngredientStock[] {
  const rank = (i: IngredientStock) => (i.spoiledCount > 0 ? 0 : i.useSoon ? 1 : 2)
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}
