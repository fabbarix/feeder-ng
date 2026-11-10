import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { checkExtraDraft, type ExtraDraftError } from '../lib/extraDraft'
import { shopStrings } from '../strings'
import type { ExtraInput } from '../types'

export interface ExtraSheetProps {
  open: boolean
  onClose: () => void
  /** the Ingredients to pick from for an Ingredient extra */
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
  const [ingredientText, setIngredientText] = useState('')
  const [quantityText, setQuantityText] = useState('')
  const [error, setError] = useState<ExtraDraftError | null>(null)

  const submit = () => {
    const result = checkExtraDraft({
      text,
      ingredientId: ingredientText === '' ? null : Number(ingredientText),
      quantityText,
    })
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
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field">
          <span className="field__label">{shopStrings.extraText}</span>
          <input className="field__input" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{shopStrings.extraIngredient}</span>
          <select className="field__input" value={ingredientText} onChange={(e) => setIngredientText(e.target.value)}>
            <option value="" />
            {ingredients.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{shopStrings.extraQuantity}</span>
          <input className="field__input" inputMode="decimal" value={quantityText} onChange={(e) => setQuantityText(e.target.value)} />
        </label>
        {error ? <p className="field__error" role="alert">{errorText[error]}</p> : null}
        <Button type="submit">{shopStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}
