// Wire types of the Scan API (docs/dev/design/t13-shopping-scan.md). Mirrors internal/scan.
import type { IngredientKind } from '../ingredients/types'
import type { Catalog } from './lib/barcode'

export type BaseUnit = 'g' | 'ml' | 'piece'
export type OpKind = 'shop_scan' | 'shop_unknown' | 'stock_take' | 'shop_tick' | 'shop_untick'
export type StockTakeAction = 'plus_pack' | 'minus_pack' | 'set_total'
export type BarcodeScope = 'global' | 'shop'
/** SR3: the kind of the Ingredient a Product belongs to (H4); absent from an older server. */
export type { IngredientKind }

export interface IngredientRef {
  id?: number
  name?: string
  baseUnit?: BaseUnit
  /** SR5 (H4): the kind a new Ingredient is created with; absent = food */
  kind?: IngredientKind
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
  /** B9-54 (RES-03), shop_tick / shop_untick of a Line: the Ingredient (with `rangeTo`) */
  ingredientId?: number
  /** B9-54 (RES-03), shop_tick of an Ingredient extra: the extra's id (a Line's tick names `ingredientId` and `rangeTo`) */
  extraId?: number
  /** B9-54, shop_tick: the Line quantity the phone showed when the User ticked (SSP-02's Q0); `quantity` is the amount added to Stock (0 = Tick without adding) */
  covers?: number
  /** B9-54, shop_untick: the client id of the tick (addition) to take off; else `ingredientId` + `rangeTo` unticks the whole Line */
  tickClientUuid?: string
  /** B9-54, shop_tick: a tick of the "more since your tick" row. Kept on the phone and sent as it is (the server ignores it): a second purchase the User asked for is not "ticked twice". */
  more?: boolean
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

/** B9-54 (RES 2): an addition made to the Line before a queued tick synced; `mine` = the same User's (their other phone). */
export interface AlsoTickedBy {
  name: string
  quantity: number
  by: 'hand' | 'scan'
  mine: boolean
  /** RFC 3339 instant it was ticked (the phone's time for a queued tick) */
  tickedAt: string
}

/** B9-54: what a shop_tick did; `lotId` null = nothing added to Stock. */
export interface AppliedTick {
  lotId: number | null
  added: number
  alsoTickedBy: AlsoTickedBy[]
}

export interface ScanResult {
  clientUuid: string
  status: ResultStatus
  error?: { code: string; message: string }
  scan?: ScanApplied
  /** B9-54: set on an applied or duplicate shop_tick */
  tick?: AppliedTick
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
