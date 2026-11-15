// B9-50 (SSP-08): the near-duplicate guard of a receipt line's new name against the Household's Products: "Kitchen roll 4 pack is already a
// Product. Use it?" with "Use Kitchen roll 4 pack". Render only.
import { Button } from '../../../ui'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export function ProductNameGuard({ product, onUse }: { product: { id: number; name: string }; onUse: (productId: number) => void }) {
  const t = newProductStrings.receipt
  return (
    <div className="new-product__guard" role="status" tabIndex={-1} data-product-guard="">
      <p>{t.alreadyProduct(product.name)}</p>
      <div className="new-product__summary-actions">
        <Button variant="secondary" size="sm" onClick={() => onUse(product.id)}>
          {t.use(product.name)}
        </Button>
      </div>
    </div>
  )
}
