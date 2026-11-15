import type { WeightRule } from '../scan/lib/barcode'

export type { Product, Shop, ShopBarcode, ShopLocation } from '../products/types'

/** A Weight Barcode Rule as the API serves it (barcode.WeightRule JSON plus its Shop). */
export interface ShopRule extends WeightRule {
  shopId: number
}

/** SAFE-02: what Delete Shop takes with it (GET /api/shops/{id}/impact). */
export interface ShopImpact {
  shopBarcodes: number
  weightBarcodeRules: number
  prices: number
}
