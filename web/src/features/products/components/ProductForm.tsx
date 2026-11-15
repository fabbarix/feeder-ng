import { useEffect } from 'react'
import { Button, CROP_ASPECTS, FormActions, ImagePicker, IngredientSelect, Stack, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useProductForm, type ProductIngredient } from '../hooks/useProductForm'
import { strings } from '../strings'
import type { BaseUnit, NewProduct } from '../types'

export interface ProductFormProps {
  /** The Ingredient the Product belongs to; leave the three out and pass `ingredients` to choose it in the form. */
  ingredientId?: number
  ingredientName?: string
  baseUnit?: BaseUnit
  /** SET-14a: the Ingredients to choose from, an "Ingredient" Select first in the form (the Products list). */
  ingredients?: (ProductIngredient & { label: string; imageUrl?: string })[]
  /** Called with the validated body; a rejection is the Barcode field's error (invalid_barcode) or the form's FormError. */
  onSubmit: (body: NewProduct) => Promise<void>
  /** The form's id, so a sheet's footer Save can submit it. */
  formId?: string
  /** The sheet draws Save in its footer: no FormActions in the body. */
  hideActions?: boolean
  /** With `hideActions`: the footer Save's state (busy while it saves; held while the Picture is still being read). */
  onBusyChange?: (state: { saving: boolean; pictureBusy: boolean }) => void
}

/**
 * Ingredient (when it is chosen here), name, pack size (in the Base Unit) and optional barcode. While the name has not been edited by
 * hand it follows `defaultProductName`. Errors are at the field, with focus to the first invalid one (lib/productForm).
 */
export function ProductForm({ ingredientId, ingredientName, baseUnit, ingredients, onSubmit, formId, hideActions = false, onBusyChange }: ProductFormProps) {
  const fixed = ingredientId !== undefined && ingredientName !== undefined && baseUnit !== undefined ? { id: ingredientId, name: ingredientName, baseUnit } : null
  const form = useProductForm(fixed, onSubmit)
  const unit = form.ingredient?.baseUnit
  useEffect(() => {
    onBusyChange?.({ saving: form.saving, pictureBusy: form.pictureBusy })
  }, [onBusyChange, form.saving, form.pictureBusy])
  return (
    <form
      id={formId}
      ref={form.formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <Stack>
        {fixed === null ? (
          <IngredientSelect
            label={strings.ingredientLabel}
            ingredients={(ingredients ?? []).map((i) => ({ id: i.id, name: i.label, baseUnit: i.baseUnit, imageUrl: i.imageUrl }))}
            value={form.ingredient?.id ?? null}
            onChange={(id) => {
              const picked = ingredients?.find((i) => i.id === id)
              if (picked) form.chooseIngredient({ id: picked.id, name: picked.name, baseUnit: picked.baseUnit })
            }}
            error={form.errors.ingredient}
          />
        ) : null}
        <TextField size="lg" label={strings.nameLabel} value={form.values.name} onChange={form.setName} error={form.errors.name} />
        <TextField
          size="sm"
          label={unit ? strings.packSizeLabel(unit) : strings.packSizeLabelPlain}
          suffix={unit}
          inputMode="decimal"
          value={form.values.packSize}
          onChange={form.setPackSize}
          error={form.errors.packSize}
        />
        <TextField size="md" label={strings.barcodeLabel} helper={strings.barcodeOptional} inputMode="numeric" data-size-intent="long" value={form.values.barcode} onChange={form.setBarcode} error={form.errors.barcode} />
        <ImagePicker label={strings.pictureLabel} value={form.values.image ?? ''} onChange={form.setImage} onBusyChange={form.setPictureBusy} aspect={CROP_ASPECTS.landscape} />
        <FormError>{form.serverError}</FormError>
        {hideActions ? null : (
          <FormActions
            primary={
              <Button type="submit" loading={form.saving} disabled={form.pictureBusy}>
                {strings.saveProduct}
              </Button>
            }
          />
        )}
      </Stack>
    </form>
  )
}
