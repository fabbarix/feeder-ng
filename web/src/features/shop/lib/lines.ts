// Presentation helpers for the Shopping List (no React).
import { formatMinor } from '../../products/lib/money'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import type { BaseUnit, ShoppingExtra, ShoppingLine, ShoppingList } from '../types'

/** One tile of the list: a Line or a manual extra, flattened for display. */
export interface ListItem {
  /** "line:<ingredientId>" or "extra:<id>" */
  key: string
  kind: 'line' | 'extra'
  ingredientId: number | null
  extraId: number | null
  title: string
  /** "1400 g · 2 × Mutti 700 g", "1400 g", "2000 ml" or "" for free text */
  detail: string
  /** "$3.18", "—" when unpriced; null where cost is not shown (extras, ticked lines) */
  cost: string | null
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

/** formatMinor(cents, currency), or "—" when cents is null. */
export function costText(cents: number | null, currency: string): string {
  return cents === null ? '—' : formatMinor(cents, currency)
}

export function lineItem(line: ShoppingLine, currency: string, system: UnitSystem): ListItem {
  return {
    key: `line:${line.ingredientId}`,
    kind: 'line',
    ingredientId: line.ingredientId,
    extraId: null,
    title: line.name,
    detail: line.ticked ? '' : packText(line, system),
    cost: line.ticked ? null : costText(line.costCents, currency),
    ticked: line.ticked,
    quantity: line.ticked ? 0 : line.quantity,
    baseUnit: line.baseUnit,
  }
}

export function extraItem(extra: ShoppingExtra, system: UnitSystem): ListItem {
  const hasAmount = extra.quantity !== null && extra.baseUnit !== null
  return {
    key: `extra:${extra.id}`,
    kind: 'extra',
    ingredientId: extra.ingredientId,
    extraId: extra.id,
    title: extra.text ?? extra.name ?? '',
    detail: hasAmount ? formatQuantity(extra.quantity ?? 0, extra.baseUnit ?? 'piece', system) : '',
    cost: null,
    ticked: extra.ticked,
    quantity: hasAmount && !extra.ticked ? (extra.quantity ?? 0) : 0,
    baseUnit: extra.baseUnit,
  }
}

/** Open items first (Lines in server order, then extras), then ticked ones (the "Done" group), in the same order. */
export function listItems(list: ShoppingList, system: UnitSystem): { open: ListItem[]; done: ListItem[] } {
  const lines = list.lines.map((l) => lineItem(l, list.currency, system))
  const extras = list.extras.map((e) => extraItem(e, system))
  const all = [...lines.filter((i) => !i.ticked), ...extras.filter((i) => !i.ticked)]
  const done = [...lines.filter((i) => i.ticked), ...extras.filter((i) => i.ticked)]
  return { open: all, done }
}
