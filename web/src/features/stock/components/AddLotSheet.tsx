import { useEffect, useState, type ReactElement } from 'react'
import { BottomSheet, Button, FormActions, DateField, IngredientSelect, Select, TextField } from '../../../ui'
import { parseAmount } from '../lib/amount'
import '../stock.css'
import type { IngredientChoice, StoragePlace } from '../types'
import { stockStrings as strings } from '../strings'

export interface AddLotSheetProps {
  open: boolean
  onClose: () => void
  choices: IngredientChoice[]
  onSubmit: (input: { ingredientId: number; quantity: number; purchased?: string; storagePlaceId?: number }) => void
  /** Pantry: offers a Storage Place; left on "Where it usually goes", the server picks the remembered one. */
  places?: StoragePlace[]
}

/**
 * BottomSheet "Add a Stock Lot" with: `IngredientSelect` labelled "Ingredient" (searchable, no onCreate; the first
 * Ingredient is the default until picked), `TextField` labelled "Quantity" (inputMode decimal, `suffix` = the chosen
 * Ingredient's Base Unit, parseAmount 'positive', error shown inline via the field's `error`), `DateField` labelled
 * "Bought on" (optional; empty = omit `purchased`), and a primary Save in the sheet `footer`.
 * No native select/date input, no separate `role="alert"` paragraph: the field's own error line is the alert (FieldFrame
 * renders it with role="alert"), so there is one message.
 */
export function AddLotSheet({ open, onClose, choices, onSubmit, places = [] }: AddLotSheetProps): ReactElement | null {
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [purchased, setPurchased] = useState('')
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The first Ingredient is the default until the User picks one.
  const chosen = choices.find((c) => c.id === pickedId) ?? choices[0]

  // The sheet's state outlives each opening (the screen keeps it mounted), so start clean every time it closes.
  useEffect(() => {
    if (open) return
    setPickedId(null)
    setQuantity('')
    setPurchased('')
    setPlaceId(null)
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
    onSubmit({
      ingredientId: chosen.id,
      quantity: amount.value,
      ...(purchased ? { purchased } : {}),
      ...(placeId !== null ? { storagePlaceId: placeId } : {}),
    })
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={strings.addTitle}
      footer={
        <FormActions primary={<Button onClick={submit}>{strings.save}</Button>} />
      }
    >
      <div className="stock-sheet__fields">
        <IngredientSelect label={strings.ingredient} ingredients={choices} value={chosen?.id ?? null}
          onChange={(id) => {
            // Stock offers only saved Ingredients (numeric ids); a string key never comes from here.
            if (typeof id === 'number') setPickedId(id)
          }}
        />
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
        {places.length > 0 ? (
          <Select<number>
            label={strings.addPlaceTo}
            entityName="Storage Place"
            options={places.map((p) => ({ value: p.id, label: p.name, meta: strings.kinds[p.kind] }))}
            value={placeId}
            onChange={setPlaceId}
            clearLabel={strings.usualPlace}
            onClear={() => setPlaceId(null)}
          />
        ) : null}
      </div>
    </BottomSheet>
  )
}
