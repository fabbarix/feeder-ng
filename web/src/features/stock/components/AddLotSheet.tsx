import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BottomSheet, Button, FormActions, DateField, IngredientSelect, Select, TextField } from '../../../ui'
import { parseAmount } from '../lib/amount'
import { deviceToday } from '../lib/days'
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
  /** SAFE-11: the Ingredient to start with, when the sheet is opened from that Ingredient's page. An id not among the choices picks none. */
  initialIngredientId?: number
}

interface AddLotErrors {
  ingredient?: string
  quantity?: string
}

/**
 * BottomSheet "Add a Stock Lot" (SAFE-11: it never assumes anything): `IngredientSelect` labelled "Ingredient" with the placeholder
 * "Choose an Ingredient" (focused on open; preselected only through `initialIngredientId`), `TextField` "Quantity" (empty, with the
 * chosen Ingredient's Base Unit as suffix once there is one), `DateField` "Bought on" (starts at today, so `purchased` is always sent),
 * the Storage Place, and Save, never disabled: a missing field gets its own error line and the first one takes the focus.
 */
export function AddLotSheet({ open, onClose, choices, onSubmit, places = [], initialIngredientId }: AddLotSheetProps): ReactElement | null {
  const [pickedId, setPickedId] = useState<number | null>(initialIngredientId ?? null)
  const [quantity, setQuantity] = useState('')
  const [purchased, setPurchased] = useState(() => deviceToday())
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [errors, setErrors] = useState<AddLotErrors>({})
  const [submits, setSubmits] = useState(0)
  const fields = useRef<HTMLDivElement>(null)
  // After a Save that leaves errors, the first invalid field takes the focus (SAFE-04). Not the shared useFocusFirstInvalid: its
  // unguarded scrollIntoView throws where the page has none (jsdom), and the sheet's body scrolls the field into view itself.
  useEffect(() => {
    if (submits === 0) return
    fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [submits])

  const chosen = choices.find((c) => c.id === pickedId) ?? null

  // The sheet's state outlives each opening (the screen keeps it mounted), so start clean every time it opens.
  useEffect(() => {
    if (!open) return
    setPickedId(initialIngredientId ?? null)
    setQuantity('')
    setPurchased(deviceToday())
    setPlaceId(null)
    setErrors({})
  }, [open, initialIngredientId])

  const submit = () => {
    const next: AddLotErrors = {}
    if (!chosen) next.ingredient = strings.addLot.needIngredient
    const amount = parseAmount(quantity, 'positive')
    if (!amount.ok) next.quantity = amount.error === 'empty' ? strings.addLot.needQuantity : strings.errors[amount.error]
    setErrors(next)
    setSubmits((n) => n + 1)
    if (!chosen || !amount.ok) return
    onSubmit({
      ingredientId: chosen.id,
      quantity: amount.value,
      ...(purchased ? { purchased } : {}),
      ...(placeId !== null ? { storagePlaceId: placeId } : {}),
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={strings.addTitle} footer={<FormActions primary={<Button onClick={submit}>{strings.save}</Button>} />}>
      <div className="stock-sheet__fields" ref={fields}>
        <IngredientSelect
          label={strings.ingredient}
          ingredients={choices}
          value={chosen?.id ?? null}
          placeholder={strings.addLot.chooseIngredient}
          error={errors.ingredient}
          onChange={(id) => {
            // Stock offers only saved Ingredients (numeric ids); a string key never comes from here.
            if (typeof id !== 'number') return
            setPickedId(id)
            setErrors((e) => ({ ...e, ingredient: undefined }))
          }}
        />
        <TextField
          label={strings.quantity}
          inputMode="decimal"
          value={quantity}
          onChange={(value) => {
            setQuantity(value)
            setErrors((e) => ({ ...e, quantity: undefined }))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          suffix={chosen?.baseUnit}
          error={errors.quantity}
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
