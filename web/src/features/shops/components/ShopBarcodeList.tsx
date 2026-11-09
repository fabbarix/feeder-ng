import type { Product, ShopBarcode, ShopRule } from '../types'

export interface ShopBarcodeListProps {
  barcodes: ShopBarcode[]
  rules: ShopRule[]
  products: Product[]
  onDelete: (id: number) => void
}

/** "PRIVATE-77 → Mutti passata" and "rule 21 · item 00123 → Ham", with delete. */
export function ShopBarcodeList(props: ShopBarcodeListProps): never {
  void props
  throw new Error('TODO')
}
