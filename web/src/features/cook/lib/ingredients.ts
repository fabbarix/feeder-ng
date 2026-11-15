// B9-45 (PC-05): the Ingredient list of "Get ready", scaled to what is cooked. Plain TypeScript, no React. STUBS: the developer builds them.
import type { UnitSystem } from '../../../lib/units'
import type { RecipeLine } from '../../recipes/types'
import type { StockLot } from '../../stock/types'

/** One Recipe's lines to cook: the Recipe as cooked (its Yield, how many Batches). */
export interface ReadySource {
  courseId?: number
  courseName?: string
  recipeName: string
  lines: RecipeLine[]
  /** The Recipe's Yield: portions one Batch makes. */
  yield: number
  /** Batches cooked: every line's quantity is multiplied by it (the Steps' "Uses" lines are scaled the same way). */
  batches: number
}

export type ReadyLot = Pick<StockLot, 'ingredientId' | 'goesOff' | 'storagePlaceId' | 'spoiled' | 'quantity'>
export interface ReadyPlace {
  id: number
  name: string
}
export interface ReadyContext {
  system: UnitSystem
  lots: ReadyLot[]
  places: ReadyPlace[]
}

/** A row of the list: the Ingredient, the scaled amount at its end, the Storage Place of its soonest Lot under the name. */
export interface ReadyRow {
  /** Unique in the whole list (the tick is kept under it). */
  key: string
  ingredientId: number
  name: string
  /** "1.2 kg", "2", "1 tbsp" (formatLineQuantity of the scaled quantity, trimmed). */
  amount: string
  /** "Fridge", "Pantry · optional", "optional" (no Lot in Stock and optional), or null. */
  place: string | null
  optional: boolean
}

/** A group of rows; `title` is null when the list is one Recipe's. */
export interface ReadySection {
  key: string
  title: string | null
  rows: ReadyRow[]
}

export function readyRows(_source: ReadySource, _ctx: ReadyContext): ReadyRow[] {
  throw new Error('B9-45: not built yet')
}

/** One section for one Recipe (no title); a section per Course, titled "Main · Roast chicken", for several. */
export function readySections(_sources: ReadySource[], _ctx: ReadyContext): ReadySection[] {
  throw new Error('B9-45: not built yet')
}

/** The Storage Place name of the soonest Lot of the Ingredient: not spoiled, with some left, the earliest `goesOff` first (no date last); "Not sorted" for a Lot with no place; null with no Lot. */
export function soonestPlace(_lots: ReadyLot[], _ingredientId: number, _places: ReadyPlace[]): string | null {
  throw new Error('B9-45: not built yet')
}

/**
 * The line under "Get ready": a Planned Meal "For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover" (the kept part only when
 * batches x yield is above the portions); a Recipe cook (portions null) "For 8 portions: 2 Batches of 4 portions".
 */
export function readyMeta(_opts: { portions: number | null; batches: number; yield: number }): string {
  throw new Error('B9-45: not built yet')
}

/** The checkbox's name: "Chicken, 1.2 kg". */
export function readyLabel(_row: ReadyRow): string {
  throw new Error('B9-45: not built yet')
}
