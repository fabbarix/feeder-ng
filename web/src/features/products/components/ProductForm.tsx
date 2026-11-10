import { Button, TextField } from '../../../ui'
import { useProductForm } from '../hooks/useProductForm'
import { strings } from '../strings'
import type { BaseUnit, NewProduct } from '../types'

export interface ProductFormProps {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  /** Called with the validated body; a rejection's message is shown in an alert. */
  onSubmit: (body: NewProduct) => Promise<void>
}

/**
 * Name, pack size (in the Base Unit) and optional barcode. While the name field has
 * not been edited by hand it follows `defaultProductName(ingredientName, packSize, baseUnit)`
 * once a valid pack size is typed. Validation via lib/productForm; shows errors under the fields.
 */
export function ProductForm({ ingredientId, ingredientName, baseUnit, onSubmit }: ProductFormProps) {
  const form = useProductForm(ingredientId, ingredientName, baseUnit, onSubmit)
  return (
    <form
      className="pg__stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <TextField label={strings.nameLabel} value={form.values.name} onChange={form.setName} error={form.errors.name} />
      <TextField
        label={strings.packSizeLabel(baseUnit)}
        inputMode="decimal"
        value={form.values.packSize}
        onChange={form.setPackSize}
        error={form.errors.packSize}
      />
      <TextField label={strings.barcodeLabel} inputMode="numeric" value={form.values.barcode} onChange={form.setBarcode} error={form.errors.barcode} />
      {form.serverError ? <p role="alert">{form.serverError}</p> : null}
      <Button type="submit" loading={form.saving}>
        {strings.saveProduct}
      </Button>
    </form>
  )
}
