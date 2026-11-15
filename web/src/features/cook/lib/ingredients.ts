// B9-45 (PC-05): the Ingredient list of "Get ready", scaled to what is cooked. Plain TypeScript, no React.
import { formatLineQuantity, formatQuantity, type UnitSystem } from '../../../lib/units'
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

const num = (n: number): string => String(Number(n.toFixed(2)))
const portionsText = (n: number): string => (n === 1 ? '1 portion' : `${num(n)} portions`)

export function readyRows(source: ReadySource, ctx: ReadyContext, keyPrefix = ''): ReadyRow[] {
  return source.lines.map((line, i) => {
    const name = line.ingredient ?? line.baseRecipe?.name ?? ''
    const qty = line.quantity * source.batches
    // a counted amount reads "6 pieces", "1 piece" (formatQuantity), never the line form "6 piece"
    const amount = (line.unit.trim().toLowerCase() === 'piece' ? formatQuantity(qty, 'piece', ctx.system) : formatLineQuantity(qty, line.unit, ctx.system)).trim()
    const where = line.ingredientId ? soonestPlace(ctx.lots, line.ingredientId, ctx.places) : null
    const place = line.optional ? (where ? `${where} · optional` : 'optional') : where
    return { key: `${keyPrefix}${i}:${line.ingredientId}`, ingredientId: line.ingredientId, name, amount, place, optional: line.optional }
  })
}

/** One section for one Recipe (no title); a section per Course, titled "Main · Roast chicken", for several. */
export function readySections(sources: ReadySource[], ctx: ReadyContext): ReadySection[] {
  const several = sources.length > 1
  return sources.flatMap((source, i) => {
    const key = `${source.courseId ?? 'r'}-${i}`
    const rows = readyRows(source, ctx, `${key}/`)
    if (rows.length === 0) return []
    const title = several ? [source.courseName, source.recipeName].filter(Boolean).join(' · ') : null
    return [{ key, title, rows }]
  })
}

/** The Storage Place name of the soonest Lot of the Ingredient: not spoiled, with some left, the earliest `goesOff` first (no date last); "Not sorted" for a Lot with no place; null with no Lot. */
export function soonestPlace(lots: ReadyLot[], ingredientId: number, places: ReadyPlace[]): string | null {
  const usable = lots.filter((l) => l.ingredientId === ingredientId && !l.spoiled && l.quantity > 0)
  if (usable.length === 0) return null
  const first = [...usable].sort((a, b) => (a.goesOff ?? '9999-99-99').localeCompare(b.goesOff ?? '9999-99-99'))[0]!
  return places.find((p) => p.id === first.storagePlaceId)?.name ?? 'Not sorted'
}

/**
 * The line under "Get ready": a Planned Meal "For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover" (the kept part only when
 * batches x yield is above the portions); a Recipe cook (portions null) "For 8 portions: 2 Batches of 4 portions".
 */
export function readyMeta(opts: { portions: number | null; batches: number; yield: number }): string {
  const made = opts.batches * opts.yield
  const portions = opts.portions ?? made
  const batches = opts.batches === 1 ? '1 Batch' : `${num(opts.batches)} Batches`
  const base = `For ${portionsText(portions)}: ${batches} of ${portionsText(opts.yield)}`
  const kept = Number((made - portions).toFixed(2))
  return opts.portions !== null && kept > 0 ? `${base}, ${num(kept)} kept as a Leftover` : base
}

/** The checkbox's name: "Chicken, 1.2 kg". */
export function readyLabel(row: ReadyRow): string {
  return row.amount ? `${row.name}, ${row.amount}` : row.name
}
