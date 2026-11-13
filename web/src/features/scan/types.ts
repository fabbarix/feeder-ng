// Wire types of the Scan API (docs/dev/design/t13-shopping-scan.md). Mirrors internal/scan.
import type { IngredientKind } from '../ingredients/types'
import type { Catalog } from './lib/barcode'

export type BaseUnit = 'g' | 'ml' | 'piece'
export type OpKind = 'shop_scan' | 'shop_unknown' | 'stock_take'
export type StockTakeAction = 'plus_pack' | 'minus_pack' | 'set_total'
export type BarcodeScope = 'global' | 'shop'
/** SR3: the kind of the Ingredient a Product belongs to (H4); absent from an older server. */
export type { IngredientKind }

export interface IngredientRef {
  id?: number
  name?: string
  baseUnit?: BaseUnit
}

/** One operation from the phone; clientUuid is the idempotency key. */
export interface Op {
  clientUuid: string
  /** RFC 3339 instant the phone scanned at */
  scannedAt: string
  kind: OpKind
  shopId?: number
  rangeTo?: string
  productId?: number
  /** Lot size in Base Units */
  quantity?: number
  priceCents?: number
  pricePerKgCents?: number
  /** shop_scan whose quantity is a weight decoded from a weight-valued barcode: the server prices it by weight (B5) */
  weighed?: boolean
  /** canonical code */
  barcode?: string
  ruleId?: number
  itemCode?: string
  ingredient?: IngredientRef
  productName?: string
  /** PP: the Picture of the Product a shop_unknown creates (an image id); left out when there is none */
  productImage?: string
  packSize?: number
  scope?: BarcodeScope
  action?: StockTakeAction
  total?: number
}

export type ResultStatus = 'applied' | 'duplicate' | 'rejected'

export interface ScanApplied {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  productId: number
  productName: string
  /** PP: "/api/images/<id>" of the Product's Picture; absent when it has none */
  productImageUrl?: string
  /** PE: the Ingredient's Picture, the fallback when the Product has none; absent when neither has one */
  ingredientImageUrl?: string
  quantity: number
  lotId: number | null
  priceCents: number | null
  onList: boolean
  remaining: number
  ticked: boolean
  productCreated: boolean
  /** SR3 (H4): the kind of the Ingredient, for the Scanned list's grouping */
  ingredientKind?: IngredientKind
  /** pictureFilled (PPX): the Product had no Picture and took the one from the form */
  merged?: { productId: number; productName: string; pictureFilled?: boolean }
  total?: number
}

export interface ScanResult {
  clientUuid: string
  status: ResultStatus
  error?: { code: string; message: string }
  scan?: ScanApplied
}

export interface OfflineProduct {
  id: number
  name: string
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  packSize: number
  /** PP: the Product's Picture, so a queued scan can be described offline; absent when none */
  imageUrl?: string
  /** PE: the Ingredient's Picture, the fallback for a queued scan; absent when none */
  ingredientImageUrl?: string
  lastPriceCents: number | null
  /** SR3: the day of lastPriceCents at this Shop, YYYY-MM-DD; absent with no Price */
  lastPriceDate?: string
  /** SR3 (H4): the kind of the Ingredient; absent from an older server */
  ingredientKind?: IngredientKind
}

/** SR3: PATCH /api/scan/prices: one Price for every scan of a row (pricePerKgCents: each scan costs its quantity at it). */
export interface PricePatch {
  clientUuids: string[]
  priceCents: number
  pricePerKgCents?: number
}

/** What the phone caches to resolve and describe a scan offline. */
export interface OfflineData {
  shopId: number | null
  shopName: string
  catalog: Catalog
  products: OfflineProduct[]
}
