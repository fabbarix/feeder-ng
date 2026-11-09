export type BaseUnit = 'g' | 'ml' | 'piece'
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
  reason: 'spoiled' | 'leftover_expired'
  lotId: number | null
}

export interface AddLotInput {
  ingredientId: number
  quantity: number
  purchased?: string
}

/** An Ingredient the person can pick when adding a Stock Lot. */
export interface IngredientChoice {
  id: number
  name: string
  baseUnit: BaseUnit
}
