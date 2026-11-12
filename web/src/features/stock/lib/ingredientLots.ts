// The Lots of one Ingredient shown inline under its By Ingredient row. Plain TypeScript, no React.
import { formatLotDate } from './display'
import { daysBetween } from './days'
import { stockStrings as strings } from '../strings'
import { describeGoOff } from './view'
import type { StockLot } from '../types'

/**
 * The Lots in Deduction order, the order Cooked takes them (ADR 0003): a go-off date before none, soonest go-off first,
 * then oldest purchase, then lowest id. Does not mutate.
 */
export function deductionOrder(lots: StockLot[]): StockLot[] {
  return [...lots].sort((a, b) => {
    if ((a.goesOff === null) !== (b.goesOff === null)) return a.goesOff === null ? 1 : -1
    if (a.goesOff !== null && b.goesOff !== null && a.goesOff !== b.goesOff) return a.goesOff < b.goesOff ? -1 : 1
    if (a.purchased !== b.purchased) return a.purchased < b.purchased ? -1 : 1
    return a.id - b.id
  })
}

/** The Lots of one Ingredient from the whole Pantry, in Deduction order. */
export function lotsOfIngredient(all: StockLot[], ingredientId: number): StockLot[] {
  return deductionOrder(all.filter((lot) => lot.ingredientId === ingredientId))
}

/** "Bought today", "Bought yesterday", else "Bought 5 Nov" (today is the household's date, YYYY-MM-DD). */
export function boughtLabel(purchased: string, today: string): string {
  const days = daysBetween(purchased, today)
  if (days === 0) return strings.boughtToday
  if (days === 1) return strings.boughtYesterday
  return strings.boughtOn(formatLotDate(purchased))
}

/**
 * The meta line of a Lot row: "Bought today · Good until Fri · Garage Fridge". "Not sorted" when `placeName` is null; no
 * go-off part without a go-off date; a Lot that has gone off says so ("Went off 3 days ago").
 */
export function lotMeta(lot: StockLot, today: string, placeName: string | null): string {
  const parts = [boughtLabel(lot.purchased, today)]
  if (lot.goesOff !== null) parts.push(describeGoOff(lot, today).label)
  parts.push(placeName ?? strings.unsorted)
  return parts.join(' · ')
}
