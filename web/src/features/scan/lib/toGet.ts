// Beta.8 (scan): the To get rows. Each open Shopping List Line is a ListEntry plus what this session's applied scans cover of
// it ("700 g of 1.4 kg", the same words and maths as a Scanned row), and the request that ticking it sends. No React.
import { lineEntry, moreEntryOf, type ListEntry } from '../../shop/lib/lines'
import type { ShoppingExtra, ShoppingLine } from '../../shop/types'
import type { UnitSystem } from '../../../lib/units'
import { coverText, type ScannedRow } from './scannedList'

export interface ToGetRow {
  entry: ListEntry
  cover: { text: string; done: boolean }
  /** B9-41 (SSP-11): a free-text extra, added by hand: it has nothing to cover, so its second line says "Added by hand" instead of a cover */
  byHand?: boolean
}

/**
 * One row per Line, in the order given. A Line is covered by the first applied (not waiting) Scanned row of its Ingredient
 * that has a cover: every such row carries the same cover of that Ingredient. With none, nothing is covered yet.
 * B9-34 (SSP-02): a ticked Line whose need grew is its "more since your tick" row ("more:<id>", for the difference); a ticked Line
 * without more is no row.
 */
export function toGetRows(lines: ShoppingLine[], scannedRows: ScannedRow[], currency: string, system: UnitSystem, extras: ShoppingExtra[] = []): ToGetRow[] {
  void extras // B9-41 (SSP-11) STUB: the developer builds the extras' rows
  return lines.flatMap((line) => {
    const entry = line.ticked ? moreEntryOf(line, currency, system) : lineEntry(line, currency, system)
    if (!entry) return []
    if (line.ticked) return [{ entry, cover: { text: coverText(0, entry.quantity, line.baseUnit, system), done: false } }]
    const covering = scannedRows.find((r) => !r.waiting && r.ingredientId === line.ingredientId && r.cover !== null)?.cover
    if (!covering) return { entry, cover: { text: coverText(0, line.quantity, line.baseUnit, system), done: false } }
    return { entry, cover: { text: coverText(covering.got, covering.of, line.baseUnit, system), done: covering.done } }
  })
}

/**
 * What ticking a To get row sends: its Ingredient and the Shop's one-tap amount (B9-34, SSP 1: the suggested pack, else what is still to
 * get; a "more since your tick" row's difference). Null when there is no Ingredient.
 */
export function tickRequest(entry: ListEntry): { ingredientId: number; quantity: number } | null {
  if (entry.ingredientId === null) return null
  return { ingredientId: entry.ingredientId, quantity: entry.defaultAmount ?? entry.quantity }
}
