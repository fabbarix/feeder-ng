// Wire types of the Shopping List API (docs/dev/design/t13-shopping-scan.md).
export type BaseUnit = 'g' | 'ml' | 'piece'

export interface PackSuggestion {
  productId: number
  name: string
  /** pack size in Base Units */
  size: number
  count: number
  remainder: number
}

export interface ShoppingLine {
  ingredientId: number
  name: string
  baseUnit: BaseUnit
  need: number
  available: number
  /** still to buy; 0 for a ticked line that Stock now covers */
  quantity: number
  ticked: boolean
  pack: PackSuggestion | null
  /** minor currency units for the suggested packs; null = no Price known ("—") */
  costCents: number | null
}

/** A manual extra: free text, or an Ingredient with a remaining quantity. */
export interface ShoppingExtra {
  id: number
  text: string | null
  ingredientId: number | null
  name: string | null
  baseUnit: BaseUnit | null
  quantity: number | null
  ticked: boolean
}

export interface ShoppingSummary {
  items: number
  spentCents: number
  lotsAdded: number
}

export interface ShoppingList {
  today: string
  horizonDays: number
  from: string
  to: string
  defaultTo: string
  maxTo: string
  currency: string
  lines: ShoppingLine[]
  extras: ShoppingExtra[]
  progress: { done: number; total: number }
  estimatedCostCents: number
  unpricedLines: number
  complete: boolean
  summary: ShoppingSummary
}

export interface ListQuery {
  shopId?: number | null
  to?: string
}

export interface TickInput {
  ingredientId: number
  to: string
  /** "how much?": 0 only ticks, > 0 adds a Stock Lot */
  quantity: number
  shopId?: number | null
  clientUuid?: string
}

export interface TickResult {
  ticked: boolean
  lotId: number | null
  created: boolean
}

export type ExtraInput = { text: string } | { ingredientId: number; quantity: number }
