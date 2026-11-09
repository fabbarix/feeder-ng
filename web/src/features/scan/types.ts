// Wire types of the Scan API (docs/dev/design/t13-shopping-scan.md). Mirrors internal/scan.
import type { Catalog } from './lib/barcode'

export type BaseUnit = 'g' | 'ml' | 'piece'
export type OpKind = 'shop_scan' | 'shop_unknown' | 'stock_take'
export type StockTakeAction = 'plus_pack' | 'minus_pack' | 'set_total'
export type BarcodeScope = 'global' | 'shop'

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
  /** canonical code */
  barcode?: string
  ruleId?: number
  itemCode?: string
  ingredient?: IngredientRef
  productName?: string
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
  quantity: number
  lotId: number | null
  priceCents: number | null
  onList: boolean
  remaining: number
  ticked: boolean
  productCreated: boolean
  merged?: { productId: number; productName: string }
  total?: number
}

export interface ScanResult {
  clientUuid: string
  status: ResultStatus
  error?: { code: string; message: string }
  scan?: ScanApplied
}

export interface BundleProduct {
  id: number
  name: string
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  packSize: number
  lastPriceCents: number | null
}

/** What the phone caches to resolve and describe a scan offline. */
export interface Bundle {
  shopId: number | null
  shopName: string
  catalog: Catalog
  products: BundleProduct[]
}
