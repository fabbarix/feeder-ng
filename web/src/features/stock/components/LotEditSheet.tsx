import { useState, type FormEvent, type ReactElement } from 'react'
import { BottomSheet, Button, DateField, FormActions, Switch, TextField } from '../../../ui'
import { capitalise } from '../lib/display'
import { changeGoesOff, changePurchased, checkLotForm, initialForm, toggleNoGoOff, type LotForm, type LotFormErrors } from '../lib/lotEdit'
import { stockStrings as strings } from '../strings'
import type { LotPatch, StockLot } from '../types'

export interface LotEditSheetProps {
  /** The Lot being corrected; null = closed. */
  lot: StockLot | null
  today: string
  onClose: () => void
  /** Called with what changed (never empty: with no change the sheet just closes). */
  onSubmit: (lot: StockLot, patch: LotPatch) => void
}

/**
 * BottomSheet "Edit <Name>" with the fields Quantity (suffix = Base Unit), Bought on (DateField, max today), Good until
 * (DateField, min Bought on) and, when the Lot's Shelf Life is null, a Switch "No go-off date"; Save in the footer.
 * State and rules are lib/lotEdit.ts (initialForm, changePurchased, changeGoesOff, toggleNoGoOff, checkLotForm); errors
 * show on the fields. Storage Place is not here: it changes with Move to.
 */
export function LotEditSheet({ lot, today, onClose, onSubmit }: LotEditSheetProps): ReactElement | null {
  return (
    <BottomSheet open={lot !== null} onClose={onClose} title={lot ? strings.editTitle(capitalise(lot.ingredientName)) : ''}>
      {lot ? <LotEditForm key={lot.id} lot={lot} today={today} onClose={onClose} onSubmit={onSubmit} /> : null}
    </BottomSheet>
  )
}

type FormProps = Pick<LotEditSheetProps, 'today' | 'onClose' | 'onSubmit'> & { lot: StockLot }

const errorText = (errors: LotFormErrors) => ({
  quantity: errors.quantity ? strings.errors[errors.quantity] : undefined,
  purchased: errors.purchased === 'future' ? strings.editErrors.future : errors.purchased ? strings.editErrors.invalidDate : undefined,
  goesOff: errors.goesOff === 'beforePurchased' ? strings.editErrors.beforePurchased : errors.goesOff ? strings.editErrors.invalidDate : undefined,
})

function LotEditForm({ lot, today, onClose, onSubmit }: FormProps) {
  const [form, setForm] = useState<LotForm>(() => initialForm(lot))
  const [errors, setErrors] = useState<LotFormErrors>({})
  const shelfLife = lot.shelfLifeDays
  const messages = errorText(errors)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const check = checkLotForm(form, lot, today)
    if (!check.ok) {
      setErrors(check.errors)
      return
    }
    if (Object.keys(check.patch).length === 0) {
      onClose()
      return
    }
    onSubmit(lot, check.patch)
  }

  return (
    <form className="pg__stack" onSubmit={save}>
      <TextField
        label={strings.quantity}
        inputMode="decimal"
        value={form.quantity}
        suffix={lot.baseUnit}
        error={messages.quantity}
        onChange={(quantity) => {
          setForm((f) => ({ ...f, quantity }))
          setErrors((e) => ({ ...e, quantity: undefined }))
        }}
      />
      <DateField
        label={strings.purchased}
        value={form.purchased}
        max={today}
        today={today}
        error={messages.purchased}
        onChange={(purchased) => {
          setForm((f) => changePurchased(f, purchased, shelfLife))
          setErrors((e) => ({ ...e, purchased: undefined, goesOff: undefined }))
        }}
      />
      <DateField
        label={strings.goodUntil}
        value={form.goesOff}
        min={form.purchased || undefined}
        today={today}
        disabled={form.noGoOff}
        error={messages.goesOff}
        onChange={(goesOff) => {
          setForm((f) => changeGoesOff(f, goesOff))
          setErrors((e) => ({ ...e, goesOff: undefined }))
        }}
      />
      {shelfLife == null ? (
        <Switch
          label={strings.noGoOffSwitch}
          checked={form.noGoOff}
          onChange={(on) => {
            setForm((f) => toggleNoGoOff(f, on, shelfLife))
            setErrors((e) => ({ ...e, goesOff: undefined }))
          }}
        />
      ) : null}
      <FormActions secondary={<Button variant="tertiary" onClick={onClose}>{strings.cancel}</Button>} primary={<Button type="submit">{strings.save}</Button>} />
    </form>
  )
}
