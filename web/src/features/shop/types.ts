// Wire types of the Shopping List API (docs/dev/design/t13-shopping-scan.md).
export type BaseUnit = 'g' | 'ml' | 'piece'

export interface PackSuggestion {
  productId: number
  name: string
  /** pack size in Base Units */
  size: number
  count: number
  remainder: number
  /** B9-23: the Price of a pack the Ingredient was never bought as (the priced fallback); absent or null for a last-bought pack. */
  price?: { cents: number; date: string; shopId: number } | null
}

/** B5-SH: a Planned Meal whose slot has passed and that is not marked Cooked or Not cooked yet; one entry per Course. */
export interface PastPlannedMeal {
  /** YYYY-MM-DD */
  date: string
  mealSlotId: number
  mealSlotName: string
  courseName: string
}

/** B9-23 (SSP-01, RES-03): one thing that put Stock on a ticked Line, oldest first in `LineTick.additions`. */
export interface TickAddition {
  /** who ticked it ("Sam"); the viewer's own name when `mine` */
  who: string
  mine: boolean
  by: 'hand' | 'scan'
  /** Base Units added to Stock; null = ticked without adding */
  quantity: number | null
  /** the id the tick was sent with; null for an addition from before the offline queue */
  clientUuid: string | null
  /** ISO instant */
  tickedAt: string
  /** ISO instant the server got it; null while it only exists on a phone (B9-54) */
  syncedAt: string | null
}

/** B9-23: how a Line (or an Ingredient extra) was ticked and what it added to Stock. */
export interface LineTick {
  by: 'hand' | 'scan'
  /** the total added to Stock in Base Units; null = nothing added */
  added: number | null
  additions: TickAddition[]
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
  /** B9-23 (SSP-02): need that grew after the tick and is not covered yet, in Base Units; absent when 0. */
  more?: number
  /** B9-23: how a ticked Line was ticked; null/absent while it is open. */
  tick?: LineTick | null
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
  /** B9-23: as ShoppingLine.tick, for a ticked extra. */
  tick?: LineTick | null
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
  /** B9-23: Base Units this tick added to Stock (0 when none) */
  added?: number
  /** B9-23: others who ticked the same Line meanwhile */
  alsoTickedBy?: { name: string; quantity: number; by: 'hand' | 'scan' }[]
}

/** B9-23: PATCH /api/shopping/ticks. `quantity` 0 is Take back (the tick stays); `clientUuid` names the addition. */
export interface ChangeTickInput {
  ingredientId: number
  to: string
  quantity: number
  shopId?: number | null
  clientUuid?: string | null
}

export interface ChangeTickResult {
  ticked: true
  lotId: number | null
  quantity: number
}

export type ExtraInput = { text: string } | { ingredientId: number; quantity: number }
