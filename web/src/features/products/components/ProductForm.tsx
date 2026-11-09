import { Button } from '../../../ui'
import { useProductForm } from '../hooks/useProductForm'
import { strings } from '../strings'
import type { BaseUnit, NewProduct } from '../types'
import { FormField } from './FormField'

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
      <FormField label={strings.nameLabel} error={form.errors.name}>
        {(c) => <input {...c} type="text" value={form.values.name} onChange={(e) => form.setName(e.target.value)} />}
      </FormField>
      <FormField label={strings.packSizeLabel(baseUnit)} error={form.errors.packSize}>
        {(c) => (
          <input
            {...c}
            type="text"
            inputMode="decimal"
            value={form.values.packSize}
            onChange={(e) => form.setPackSize(e.target.value)}
          />
        )}
      </FormField>
      <FormField label={strings.barcodeLabel} error={form.errors.barcode}>
        {(c) => (
          <input {...c} type="text" inputMode="numeric" value={form.values.barcode} onChange={(e) => form.setBarcode(e.target.value)} />
        )}
      </FormField>
      {form.serverError ? (
        <p role="alert" className="pg__error">
          {form.serverError}
        </p>
      ) : null}
      <Button type="submit" loading={form.saving}>
        {strings.saveProduct}
      </Button>
    </form>
  )
}
