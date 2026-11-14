// Beta.8 (scan): the To get rows. Each open Shopping List Line is a ListEntry plus what this session's applied scans cover of
// it ("700 of 1400 g", the same words and maths as a Scanned row), and the request that ticking it sends. No React.
import { lineEntry, type ListEntry } from '../../shop/lib/lines'
import type { ShoppingLine } from '../../shop/types'
import type { UnitSystem } from '../../../lib/units'
import { coverText, type ScannedRow } from './scannedList'

export interface ToGetRow {
  entry: ListEntry
  cover: { text: string; done: boolean }
}

/**
 * One row per Line, in the order given. A Line is covered by the first applied (not waiting) Scanned row of its Ingredient
 * that has a cover: every such row carries the same cover of that Ingredient. With none, nothing is covered yet.
 */
export function toGetRows(lines: ShoppingLine[], scannedRows: ScannedRow[], currency: string, system: UnitSystem): ToGetRow[] {
  return lines.map((line) => {
    const entry = lineEntry(line, currency, system)
    const covering = scannedRows.find((r) => !r.waiting && r.ingredientId === line.ingredientId && r.cover !== null)?.cover
    if (!covering) return { entry, cover: { text: coverText(0, line.quantity, line.baseUnit, system), done: false } }
    return { entry, cover: { text: coverText(covering.got, covering.of, line.baseUnit, system), done: covering.done } }
  })
}

/** What ticking a To get row sends: its Ingredient and what is still to get (the Shop screen's "How much?" prefill). Null when there is no Ingredient. */
export function tickRequest(entry: ListEntry): { ingredientId: number; quantity: number } | null {
  if (entry.ingredientId === null) return null
  return { ingredientId: entry.ingredientId, quantity: entry.quantity }
}
