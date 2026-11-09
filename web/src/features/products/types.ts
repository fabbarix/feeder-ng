// Wire types of the Products API (docs/dev/design/t9-products-shops.md).
export type BaseUnit = 'g' | 'ml' | 'piece'

export interface Product {
  id: number
  name: string
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  /** in the Ingredient's Base Unit */
  packSize: number
}

export interface Shop {
  id: number
  name: string
}

export interface ShopBarcode {
  id: number
  shopId: number
  productId: number
  /** plain Shop-only code */
  code?: string
  /** weighed: the Weight Barcode Rule and the item code it reads */
  ruleId?: number
  itemCode?: string
}

/** Minor currency units (cents for USD). */
export interface Price {
  id: number
  productId: number
  shopId: number
  /** YYYY-MM-DD */
  date: string
  priceCents: number | null
  pricePerKgCents: number | null
  pricePerKgDerived: boolean
}

export interface ProductDetail extends Product {
  barcodes: string[]
  shops: Shop[]
  shopBarcodes: ShopBarcode[]
  latestPrices: Price[]
}

export interface NewProduct {
  name: string
  ingredientId: number
  packSize: number
  /** raw barcodes; the server canonicalises */
  barcodes: string[]
  shopBarcodes?: ({ shopId: number; code: string } | { shopId: number; ruleId: number; itemCode: string })[]
}

export interface PriceBody {
  shopId: number
  date: string
  priceCents?: number
  pricePerKgCents?: number
}
