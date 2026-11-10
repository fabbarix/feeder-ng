import { useEffect, useState, type ReactElement } from 'react'
import { BottomSheet, Button, DateField, IngredientSelect, TextField } from '../../../ui'
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
 * BottomSheet "Add a Stock Lot" with: `IngredientSelect` labelled "Ingredient" (searchable, no onCreate; the first
 * Ingredient is the default until picked), `TextField` labelled "Quantity" (inputMode decimal, `suffix` = the chosen
 * Ingredient's Base Unit, parseAmount 'positive', error shown inline via the field's `error`), `DateField` labelled
 * "Bought on" (optional; empty = omit `purchased`), and a primary Save in the sheet `footer`.
 * No native select/date input, no `role="alert"` paragraph (the field error is the message).
 */
export function AddLotSheet({ open, onClose, choices, onSubmit }: AddLotSheetProps): ReactElement | null {
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [purchased, setPurchased] = useState('')
  const [error, setError] = useState<string | null>(null)

  // The first Ingredient is the default until the User picks one.
  const chosen = choices.find((c) => c.id === pickedId) ?? choices[0]

  // The sheet's state outlives each opening (the screen keeps it mounted), so start clean every time it closes.
  useEffect(() => {
    if (open) return
    setPickedId(null)
    setQuantity('')
    setPurchased('')
    setError(null)
  }, [open])

  const submit = () => {
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
    <BottomSheet
      open={open}
      onClose={onClose}
      title={strings.addTitle}
      footer={
        <Button onClick={submit}>
          {strings.save}
        </Button>
      }
    >
      <IngredientSelect label={strings.ingredient} ingredients={choices} value={chosen?.id ?? null} onChange={setPickedId} />
      <TextField
        label={strings.quantity}
        inputMode="decimal"
        value={quantity}
        onChange={(value) => {
          setQuantity(value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        suffix={chosen?.baseUnit}
        error={error ?? undefined}
      />
      <DateField label={strings.purchased} value={purchased} onChange={setPurchased} />
    </BottomSheet>
  )
}
