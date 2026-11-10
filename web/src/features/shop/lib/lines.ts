// Presentation helpers for the Shopping List (no React).
import { formatMinor } from '../../products/lib/money'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit, ShoppingExtra, ShoppingLine, ShoppingList } from '../types'

/** One tile of the list: a Line or a manual extra, flattened for display. */
export interface ListEntry {
  /** "line:<ingredientId>" or "extra:<id>" */
  key: string
  kind: 'line' | 'extra'
  ingredientId: number | null
  extraId: number | null
  title: string
  /** "1400 g · 2 × Mutti 700 g", "1400 g", "2000 ml" or "" for free text (the Scan live list shows this) */
  detail: string
  /** the big number of the tile ("1400 g", "2000 ml"); "" for free text and ticked entries (WP7) */
  quantityText: string
  /** the muted pack line ("2 × Mutti 700 g"); "" when there is no pack suggestion or the entry is ticked (WP7) */
  packLine: string
  /** "$3.18"; null when the Line has no Price (nothing is shown, never a dash) or where no estimate applies (extras, ticked lines) */
  estimatedCost: string | null
  ticked: boolean
  /** the remaining amount in Base Units (what "How much?" is prefilled with); 0 for free text and covered lines */
  quantity: number
  baseUnit: BaseUnit | null
}

/** "1400 g · 2 × Mutti 700 g" (quantity via formatQuantity, then packs); just "1400 g" with no pack suggestion. */
export function packText(line: Pick<ShoppingLine, 'quantity' | 'baseUnit' | 'pack'>, system: UnitSystem): string {
  const amount = formatQuantity(line.quantity, line.baseUnit, system)
  return line.pack ? `${amount} · ${line.pack.count} × ${line.pack.name}` : amount
}

/** formatMinor(cents, currency), or null when cents is null (WP7: no "—"). */
export function priceText(cents: number | null, currency: string): string | null {
  return cents === null ? '—' : formatMinor(cents, currency)
}

export function lineEntry(line: ShoppingLine, currency: string, system: UnitSystem): ListEntry {
  return {
    key: `line:${line.ingredientId}`,
    kind: 'line',
    ingredientId: line.ingredientId,
    extraId: null,
    title: line.name,
    detail: line.ticked ? '' : packText(line, system),
    quantityText: '',
    packLine: '',
    estimatedCost: line.ticked ? null : priceText(line.estimatedCostCents, currency),
    ticked: line.ticked,
    quantity: line.ticked ? 0 : line.quantity,
    baseUnit: line.baseUnit,
  }
}

export function extraEntry(extra: ShoppingExtra, system: UnitSystem): ListEntry {
  const hasAmount = extra.quantity !== null && extra.baseUnit !== null
  return {
    key: `extra:${extra.id}`,
    kind: 'extra',
    ingredientId: extra.ingredientId,
    extraId: extra.id,
    title: extra.text ?? extra.name ?? '',
    detail: hasAmount ? formatQuantity(extra.quantity ?? 0, extra.baseUnit ?? 'piece', system) : '',
    quantityText: '',
    packLine: '',
    estimatedCost: null,
    ticked: extra.ticked,
    quantity: hasAmount && !extra.ticked ? (extra.quantity ?? 0) : 0,
    baseUnit: extra.baseUnit,
  }
}

/** Open entries first (Lines in server order, then extras), then ticked ones (the "Ticked" group), in the same order. */
export function listEntries(list: ShoppingList, system: UnitSystem): { open: ListEntry[]; ticked: ListEntry[] } {
  const lines = list.lines.map((l) => lineEntry(l, list.currency, system))
  const extras = list.extras.map((e) => extraEntry(e, system))
  const all = [...lines.filter((i) => !i.ticked), ...extras.filter((i) => !i.ticked)]
  const ticked = [...lines.filter((i) => i.ticked), ...extras.filter((i) => i.ticked)]
  return { open: all, ticked }
}
