export type BaseUnit = 'g' | 'ml' | 'piece'
/** H4: what a Stock row is: food, or a Supply (a non-food thing the Household buys; it never goes off). Absent in older fixtures = food. */
export type StockKind = 'food' | 'supply'
export type LotSource = 'scan' | 'stock_take' | 'manual'

/** A Stock Lot as the API returns it (quantity in Base Units, dates YYYY-MM-DD). */
export interface StockLot {
  id: number
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  quantity: number
  purchased: string
  goesOff: string | null
  source: LotSource
  productId: number | null
  shopId: number | null
  spoiled: boolean
  useSoon: boolean
  /** Pantry: the Storage Place it is in; null = not sorted (absent in older fixtures). */
  storagePlaceId?: number | null
  /** Pantry: the Ingredient's Picture, '' = none. */
  ingredientImageUrl?: string
  /** Beta.5: the Shelf Life in days that applies where the Lot is (the frozen one in a Freezer); null = it does not spoil there. */
  shelfLifeDays?: number | null
  /** H4: 'supply' for a Supply's Lot (goesOff and shelfLifeDays are then always null); absent = food. */
  kind?: StockKind
}

/**
 * Beta.5: a correction to a Lot (PATCH /api/stock/lots/{id}). A field left out is left as it is; `goesOff: null` clears
 * Good until. A changed `purchased` with no `goesOff` makes the server suggest Good until again from the Shelf Life.
 */
export interface LotPatch {
  quantity?: number
  purchased?: string
  goesOff?: string | null
}

/** Pantry: a Storage Place's kind; a Freezer uses the Ingredient's frozen Shelf Life. */
export type StorageKind = 'pantry' | 'fridge' | 'freezer'

/** Pantry: where the Household keeps Stock (Kitchen Pantry, Garage Freezer, ...). */
export interface StoragePlace {
  id: number
  name: string
  kind: StorageKind
  /** New Lots of an Ingredient never put anywhere go here. */
  default: boolean
}

export interface StoragePlaceInput {
  name?: string
  kind?: StorageKind
  default?: boolean
}

/** The lots and spoiled responses: the lots plus the household's date today (YYYY-MM-DD), which the server uses for the flags. */
export interface StockLotsResponse {
  lots: StockLot[]
  today: string
}

/** One Ingredient's Stock. */
export interface IngredientStock {
  ingredientId: number
  name: string
  baseUnit: BaseUnit
  total: number
  lotCount: number
  nextGoesOff: string | null
  useSoon: boolean
  spoiledCount: number
  /** PE: "/api/images/<id>" of the Ingredient's Picture, '' = none. */
  imageUrl?: string
  /** H4: 'supply' for a Supply; absent = food. */
  kind?: StockKind
}

export interface StockWarning {
  ingredientId: number
  name: string
  baseUnit: BaseUnit
  have: number
  need: number
  shortfall: number
  message: string
}

export interface WasteRecord {
  id: number
  ingredientId: number | null
  quantity: number
  wastedOn: string
  reason: 'spoiled' | 'leftover_discarded'
  lotId: number | null
}

export interface AddLotInput {
  ingredientId: number
  quantity: number
  purchased?: string
  /** Pantry: the Storage Place; absent = where the Ingredient was last put. */
  storagePlaceId?: number
}

/** An Ingredient the User can pick when adding a Stock Lot. */
export interface IngredientChoice {
  id: number
  name: string
  baseUnit: BaseUnit
  /** PE: the Ingredient's Picture address ('' or absent = none). */
  imageUrl?: string
  /** H2: food or Supply; absent = food. */
  kind?: StockKind
  /** H2: a Supply's Restock level in Base Units; null = none (always null for food). */
  restockLevel?: number | null
  /** The subheader of Add to Stock: 'Ingredients' or 'Supplies'; absent while the Household has no Supply. */
  group?: 'Ingredients' | 'Supplies'
}
