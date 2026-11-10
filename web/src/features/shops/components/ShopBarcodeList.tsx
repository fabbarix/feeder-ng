import { IconButton, ListGroup, ListRow } from '../../../ui'
import { shopBarcodeLabel } from '../lib/shopBarcodeForm'
import { strings } from '../strings'
import type { Product, ShopBarcode, ShopRule } from '../types'
import '../../products/products.css'

export interface ShopBarcodeListProps {
  barcodes: ShopBarcode[]
  rules: ShopRule[]
  products: Product[]
  onDelete: (id: number) => void
}

/** "PRIVATE-77 → Mutti passata" and "Weighed · prefix 21 · item 00123 → Ham", with a delete IconButton. */
export function ShopBarcodeList({ barcodes, rules, products, onDelete }: ShopBarcodeListProps) {
  if (barcodes.length === 0) return <p className="pg__muted">{strings.noShopBarcodes}</p>
  return (
    <ListGroup label={strings.shopBarcodesTitle}>
      {barcodes.map((b) => {
        const label = shopBarcodeLabel(b, rules)
        const product = products.find((p) => p.id === b.productId)?.name ?? strings.unknownProduct
        return (
          <ListRow
            key={b.id}
            title={`${label} → ${product}`}
            trailing={<IconButton icon="delete" label={strings.deleteShopBarcode(label)} onClick={() => onDelete(b.id)} />}
          />
        )
      })}
    </ListGroup>
  )
}
