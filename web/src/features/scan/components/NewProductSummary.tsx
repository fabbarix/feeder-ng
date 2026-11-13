// The summary line (SR5, 13.5 step 5): 'Saved as "<name>", Any Shop.' with Rename and the scope; Rename turns it into the name field.
import { Button, TextField } from '../../../ui'
import type { BarcodeScope } from '../types'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export interface NewProductSummaryProps {
  name: string
  renaming: boolean
  scope: BarcodeScope
  shopName: string
  error: boolean
  onRename: () => void
  onName: (name: string) => void
  onToggleScope: () => void
}

export function NewProductSummary({ name, renaming, scope, shopName, error, onRename, onName, onToggleScope }: NewProductSummaryProps) {
  if (renaming) {
    return (
      <TextField
        label={newProductStrings.productName}
        value={name}
        onChange={onName}
        error={error ? newProductStrings.needName : undefined}
        autoFocus
      />
    )
  }
  if (name === '') return null
  return (
    <div role="note" className="new-product__summary">
      <p>{scope === 'shop' ? newProductStrings.savedAsShop(name, shopName) : newProductStrings.savedAs(name)}</p>
      <div className="new-product__summary-actions">
        <Button variant="tertiary" size="sm" onClick={onRename}>
          {newProductStrings.rename}
        </Button>
        <Button variant="tertiary" size="sm" onClick={onToggleScope}>
          {scope === 'shop' ? newProductStrings.moreAnyShop : newProductStrings.moreThisShop}
        </Button>
      </div>
    </div>
  )
}
