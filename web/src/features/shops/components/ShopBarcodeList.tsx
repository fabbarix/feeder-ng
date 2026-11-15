import { IconButton, ListGroup, ListRow, Muted } from '../../../ui'
import { shopPageBarcodeRows } from '../lib/shopBarcodeRows'
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

/** R-E rows: "Mutti passata" · "PRIVATE-77" at the row's end · "The Shop's own label" (a weighed one: its item code, its rule), with a delete IconButton. */
export function ShopBarcodeList({ barcodes, rules, products, onDelete }: ShopBarcodeListProps) {
  if (barcodes.length === 0) return <Muted>{strings.noShopBarcodes}</Muted>
  return (
    <ListGroup label={strings.shopBarcodesTitle}>
      {shopPageBarcodeRows(barcodes, rules, products).map((r) => (
        <ListRow
          key={r.barcode.id}
          title={r.key}
          wrapTitle
          value={r.state}
          meta={r.detail}
          trailing={<IconButton icon="delete" label={strings.deleteShopBarcode(r.label)} onClick={() => onDelete(r.barcode, r.label)} />}
        />
      ))}
    </ListGroup>
  )
}
