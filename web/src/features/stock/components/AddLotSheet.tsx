import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { parseAmount } from '../lib/amount'
import type { IngredientChoice } from '../types'
import { stockStrings as strings } from '../strings'

export interface AddLotSheetProps {
  open: boolean
  onClose: () => void
  choices: IngredientChoice[]
  onSubmit: (input: { ingredientId: number; quantity: number; purchased?: string }) => void
}

/**
 * BottomSheet "Add a Stock Lot": a select labelled "Ingredient", an input labelled
 * "Quantity" (parseAmount 'positive'; the unit is shown from the chosen Ingredient's
 * Base Unit), an optional date "Bought on", and Save. Invalid entry shows the error and does not submit.
 */
export function AddLotSheet({ open, onClose, choices, onSubmit }: AddLotSheetProps): ReactElement | null {
  const ids = { ingredient: useId(), quantity: useId(), purchased: useId() }
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [purchased, setPurchased] = useState('')
  const [error, setError] = useState<string | null>(null)

  // The first Ingredient is the default until the User picks one.
  const chosen = choices.find((c) => c.id === pickedId) ?? choices[0]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = parseAmount(quantity, 'positive')
    if (!amount.ok) {
      setError(strings.errors[amount.error])
      return
    }
    if (!chosen) return
    setError(null)
    onSubmit(purchased ? { ingredientId: chosen.id, quantity: amount.value, purchased } : { ingredientId: chosen.id, quantity: amount.value })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={strings.addTitle}>
      <form className="stock-form" onSubmit={submit}>
        <label htmlFor={ids.ingredient}>{strings.ingredient}</label>
        <select id={ids.ingredient} value={chosen ? String(chosen.id) : ''} onChange={(e) => setPickedId(Number(e.target.value))}>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label htmlFor={ids.quantity}>{strings.quantity}</label>
        <span className="stock-form__amount">
          <input id={ids.quantity} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          {chosen ? <span className="stock-form__unit">{chosen.baseUnit}</span> : null}
        </span>
        <label htmlFor={ids.purchased}>{strings.purchased}</label>
        <input id={ids.purchased} type="date" value={purchased} onChange={(e) => setPurchased(e.target.value)} />
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit">{strings.save}</Button>
      </form>
    </BottomSheet>
  )
}
