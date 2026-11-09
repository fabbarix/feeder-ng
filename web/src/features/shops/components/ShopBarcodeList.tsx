import { Button } from '../../../ui'
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

/** "PRIVATE-77 → Mutti passata" and "rule 21 · item 00123 → Ham", with delete. */
export function ShopBarcodeList({ barcodes, rules, products, onDelete }: ShopBarcodeListProps) {
  if (barcodes.length === 0) return <p className="pg__muted">{strings.noShopBarcodes}</p>
  return (
    <ul className="pg__list">
      {barcodes.map((b) => {
        const label = shopBarcodeLabel(b, rules)
        const product = products.find((p) => p.id === b.productId)?.name ?? strings.unknownProduct
        return (
          <li key={b.id} className="pg__row pg__row--between">
            <span>
              {label} → {product}
            </span>
            <Button variant="ghost" aria-label={strings.deleteShopBarcode(label)} onClick={() => onDelete(b.id)}>
              {strings.deleteBarcode}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
