// Presentation helpers for the Shopping List (no React). Stubs until implemented.
import type { UnitSystem } from '../../../lib/units'
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
  void line
  void system
  throw new Error('not implemented')
}

/** formatMinor(cents, currency), or "—" when cents is null. */
export function costText(cents: number | null, currency: string): string {
  void cents
  void currency
  throw new Error('not implemented')
}

export function lineItem(line: ShoppingLine, currency: string, system: UnitSystem): ListItem {
  void line
  void currency
  void system
  throw new Error('not implemented')
}

export function extraItem(extra: ShoppingExtra, system: UnitSystem): ListItem {
  void extra
  void system
  throw new Error('not implemented')
}

/** Open items first (Lines in server order, then extras), then ticked ones (the "Done" group), in the same order. */
export function listItems(list: ShoppingList, system: UnitSystem): { open: ListItem[]; done: ListItem[] } {
  void list
  void system
  throw new Error('not implemented')
}
