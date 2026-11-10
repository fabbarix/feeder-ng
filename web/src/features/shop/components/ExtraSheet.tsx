import { useMemo, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { NumberField } from '../../../ui/fields/NumberField'
import { TextField } from '../../../ui/fields/TextField'
import { Select } from '../../../ui/Select/Select'
import { ingredientPickerOptions } from '../lib/ingredientOptions'
import { checkExtraDraft, type ExtraDraftError } from '../lib/extraDraft'
import { shopStrings } from '../strings'
import type { ExtraInput } from '../types'

export interface ExtraSheetProps {
  open: boolean
  onClose: () => void
  /** the Ingredients to pick from for an Ingredient extra; baseUnit is the unit the quantity is in */
  ingredients: { id: number; name: string; baseUnit: string }[]
  onSubmit: (input: ExtraInput) => void
}

const errorText: Record<ExtraDraftError, string> = {
  required: shopStrings.required,
  bothFilled: shopStrings.pickOneNotBoth,
  mustBePositive: shopStrings.mustBePositive,
}

/** "Add an extra": free text, or an Ingredient with a quantity. Checking the fields is lib/extraDraft's job. */
export function ExtraSheet({ open, onClose, ingredients, onSubmit }: ExtraSheetProps) {
  const [text, setText] = useState('')
  const [ingredientId, setIngredientId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number | null>(null)
  const [error, setError] = useState<ExtraDraftError | null>(null)
  const picked = ingredients.find((i) => i.id === ingredientId) ?? null
  const options = useMemo(() => ingredientPickerOptions(ingredients), [ingredients])

  const submit = () => {
    const result = checkExtraDraft({ text, ingredientId, quantityText: quantity === null ? '' : String(quantity) })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSubmit(result.input)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={shopStrings.addExtra}>
      <form
        className="shop-sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <TextField
          label={shopStrings.extraText}
          value={text}
          onChange={setText}
          error={error === 'required' || error === 'bothFilled' ? errorText[error] : undefined}
        />
        <Select<number>
          label={shopStrings.extraIngredient}
          entityName="Ingredient"
          options={options}
          value={ingredientId}
          onChange={setIngredientId}
        />
        {picked ? (
          <NumberField
            label={shopStrings.extraQuantity}
            value={quantity}
            onChange={setQuantity}
            min={0}
            unit={picked.baseUnit}
            error={error === 'mustBePositive' ? errorText.mustBePositive : undefined}
          />
        ) : null}
        <Button type="submit">{shopStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}
