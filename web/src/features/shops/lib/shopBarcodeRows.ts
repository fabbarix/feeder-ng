// The Shop page's Shop Barcode rows (R-E, as on the Product page): the Product as key, the code (or a weighed code's item code) as
// state at the row's end, and what the code is as detail. The label names the code in the delete button and the Undo toast.
// Plain TypeScript, no React.
import { strings } from '../strings'
import type { Product, ShopBarcode, ShopRule } from '../types'
import { shopBarcodeLabel } from './shopBarcodeForm'

export interface ShopPageBarcodeRow {
  barcode: ShopBarcode
  key: string
  state: string
  detail: string
  label: string
}

export function shopPageBarcodeRows(barcodes: ShopBarcode[], rules: ShopRule[], products: Pick<Product, 'id' | 'name'>[]): ShopPageBarcodeRow[] {
  return barcodes.map((b) => {
    const key = products.find((p) => p.id === b.productId)?.name ?? strings.unknownProduct
    const label = shopBarcodeLabel(b, rules)
    if (b.code !== undefined) return { barcode: b, key, state: b.code, detail: strings.shopOwnLabel, label }
    return { barcode: b, key, state: b.itemCode ?? '', detail: strings.weighedRule(rules.find((r) => r.id === b.ruleId)?.prefix), label }
  })
}
