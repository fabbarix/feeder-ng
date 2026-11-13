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

/** B5-SH: a Planned Meal whose slot has passed and that is not marked Cooked or Not cooked yet; one entry per Course. */
export interface PastPlannedMeal {
  /** YYYY-MM-DD */
  date: string
  mealSlotId: number
  mealSlotName: string
  courseName: string
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
  estimatedCostCents: number | null
  /** PE: "/api/images/<id>" of the Ingredient's Picture, '' = none (the server always sends it). */
  imageUrl?: string
  /** B5-SH: the unconfirmed past meals this need includes; absent in a list saved by an older version. */
  pastPlannedMeals?: PastPlannedMeal[]
  /** H4/H7′: a Supply is 'supply'; absent (an older saved list) or 'food' is food. */
  kind?: 'food' | 'supply'
  /** H7′: why a Supply Line is on the list (Base Units): its Restock level and the Stock now; null when it has no reason. */
  restock?: { level: number; stock: number } | null
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
  /** PE: the Ingredient's Picture of an Ingredient extra. */
  imageUrl?: string
  /** H4/H7′: 'supply' for an Ingredient extra of a Supply; null for free text; absent means food. */
  kind?: 'food' | 'supply' | null
}

export interface ShoppingSummary {
  lines: number
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
  /** B5-SH: Lines taken off the list for this range; absent in a list saved by an older version. */
  notNeeded?: ShoppingLine[]
  extras: ShoppingExtra[]
  progress: { ticked: number; total: number }
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

export interface NotNeededInput {
  ingredientId: number
  /** the range's last date, as the list answered it */
  to: string
  shopId?: number | null
}

export interface TickResult {
  ticked: boolean
  lotId: number | null
  created: boolean
}

export type ExtraInput = { text: string } | { ingredientId: number; quantity: number }
