import { IconButton, ListGroup, ListRow, Muted } from '../../../ui'
import { shopBarcodeLabel } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { Product, ShopBarcode, ShopRule } from '../types'
import '../../products/products.css'

export interface ShopBarcodeListProps {
  barcodes: ShopBarcode[]
  rules: ShopRule[]
  products: Product[]
  /** Removes it at once (the screen offers Undo). */
  onDelete: (barcode: ShopBarcode, label: string) => void
}

/** "PRIVATE-77 → Mutti passata" and "Weighed · prefix 21 · item 00123 → Ham", with a delete IconButton. */
export function ShopBarcodeList({ barcodes, rules, products, onDelete }: ShopBarcodeListProps) {
  if (barcodes.length === 0) return <Muted>{strings.noShopBarcodes}</Muted>
  return (
    <ListGroup label={strings.shopBarcodesTitle}>
      {barcodes.map((b) => {
        const label = shopBarcodeLabel(b, rules)
        const product = products.find((p) => p.id === b.productId)?.name ?? strings.unknownProduct
        return (
          <ListRow
            key={b.id}
            title={`${label} → ${product}`}
            trailing={<IconButton icon="delete" label={strings.deleteShopBarcode(label)} onClick={() => onDelete(b, label)} />}
          />
        )
      })}
    </ListGroup>
  )
}
