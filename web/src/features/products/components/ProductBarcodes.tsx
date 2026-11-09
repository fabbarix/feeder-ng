import type { ShopBarcode, Shop } from '../types'

export interface ProductBarcodesProps {
  barcodes: string[]
  shopBarcodes: ShopBarcode[]
  shops: Shop[]
  onAdd: (raw: string) => Promise<void>
  onRemove: (code: string) => void
}

/** Global barcodes as chips with remove, an add input (validated with scan/lib canonical), and the Shop Barcodes read-only per Shop. */
export function ProductBarcodes(props: ProductBarcodesProps): never {
  void props
  throw new Error('TODO')
}
