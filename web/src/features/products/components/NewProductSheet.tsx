import { useId } from 'react'
import { BottomSheet } from '../../../ui'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { strings } from '../strings'
import type { BaseUnit, NewProduct } from '../types'
import { ProductForm } from './ProductForm'

export interface NewProductSheetProps {
  open: boolean
  onClose: () => void
  /** The Ingredient's page passes its Ingredient; without it (the Products list) the form starts with an Ingredient Select. */
  ingredient?: { id: number; name: string; baseUnit: BaseUnit }
  /** Rejects with the server's refusal (shown at the field or as the form's error); the caller closes the sheet on success. */
  onSubmit: (body: NewProduct) => Promise<void>
}

/** SET-14a: "New Product", shared by the Products list and an Ingredient's Products tile. Cancel and Save Product are its footer (no Close). */
export function NewProductSheet({ open, onClose, ingredient, onSubmit }: NewProductSheetProps) {
  const formId = useId()
  return (
    <BottomSheet open={open} onClose={onClose} onCancel={onClose} cancelLabel={strings.cancel} submit={{ label: strings.saveProduct, form: formId }} title={strings.newProduct}>
      {!open ? null : ingredient ? (
        <ProductForm formId={formId} hideActions ingredientId={ingredient.id} ingredientName={ingredient.name} baseUnit={ingredient.baseUnit} onSubmit={onSubmit} />
      ) : (
        <ChoosingProductForm formId={formId} onSubmit={onSubmit} />
      )}
    </BottomSheet>
  )
}

/** The form of the Products list: the Ingredient is chosen first, from every Ingredient. */
function ChoosingProductForm({ formId, onSubmit }: { formId: string; onSubmit: (body: NewProduct) => Promise<void> }) {
  const { ingredients } = useIngredientChoices()
  return <ProductForm formId={formId} hideActions ingredients={ingredients} onSubmit={onSubmit} />
}
