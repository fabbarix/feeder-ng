import type { WeightRule } from '../scan/lib/barcode'

export type { Product, Shop, ShopBarcode, ShopLocation } from '../products/types'

/** A Weight Barcode Rule as the API serves it (barcode.WeightRule JSON plus its Shop). */
export interface ShopRule extends WeightRule {
  shopId: number
}
