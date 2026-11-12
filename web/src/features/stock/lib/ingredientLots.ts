// The Lots of one Ingredient shown inline under its By Ingredient row. Plain TypeScript, no React.
import type { StockLot } from '../types'

/**
 * The Lots in Deduction order, the order Cooked takes them (ADR 0003): a go-off date before none, soonest go-off first,
 * then oldest purchase, then lowest id. Does not mutate.
 */
export function deductionOrder(lots: StockLot[]): StockLot[] {
  return [...lots]
}

/** The Lots of one Ingredient from the whole Pantry, in Deduction order. */
export function lotsOfIngredient(all: StockLot[], ingredientId: number): StockLot[] {
  void all
  void ingredientId
  throw new Error('not implemented (b5-st)')
}

/** "Bought today", "Bought yesterday", else "Bought 5 Nov" (today is the household's date, YYYY-MM-DD). */
export function boughtLabel(purchased: string, today: string): string {
  void purchased
  void today
  throw new Error('not implemented (b5-st)')
}

/**
 * The meta line of a Lot row: "Bought today · Good until Fri · Garage Fridge". "Not sorted" when `placeName` is null; no
 * go-off part without a go-off date; a Lot that has gone off says so ("Went off 3 days ago").
 */
export function lotMeta(lot: StockLot, today: string, placeName: string | null): string {
  void lot
  void today
  void placeName
  throw new Error('not implemented (b5-st)')
}
