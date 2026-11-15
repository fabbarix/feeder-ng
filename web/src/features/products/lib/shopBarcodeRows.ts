// The Product page's Shop Barcode rows (SET-04): R-E rows with the code (or the item code of a weighed one) as key, the Shop as
// state and what the code is as detail. Plain TypeScript, no React.
import { strings } from '../strings'
import type { Shop, ShopBarcode } from '../types'

export interface ShopBarcodeRow {
  id: number
  key: string
  state: string
  detail: string
}

export function shopBarcodeRows(barcodes: ShopBarcode[], shops: Shop[], rules: { id: number; prefix: string }[]): ShopBarcodeRow[] {
  return barcodes.map((b) => {
    const state = shops.find((s) => s.id === b.shopId)?.name ?? strings.unknownShop
    if (b.ruleId === undefined) return { id: b.id, key: b.code ?? '', state, detail: strings.shopOwnLabel }
    const prefix = rules.find((r) => r.id === b.ruleId)?.prefix
    return { id: b.id, key: b.itemCode ?? '', state, detail: strings.weighedShopBarcode(prefix, b.itemCode ?? '') }
  })
}
