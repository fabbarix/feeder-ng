import type { ReactNode } from 'react'
import { BottomSheet, Button } from '../../../ui'
import type { Correction } from '../lib/cook'
import { useTotalField } from '../hooks/useTotalField'
import { planStrings } from '../strings'
import '../plan.css'

export interface StockCorrectionSheetProps {
  open: boolean
  onClose: () => void
  correction: Correction | null
  onSave: (total: number) => void
  busy: boolean
  error: string | null
}

function TotalForm({ correction, onSave, busy, error }: Pick<StockCorrectionSheetProps, 'onSave' | 'busy' | 'error'> & { correction: Correction }) {
  const field = useTotalField(correction.total, onSave)
  const message = field.error ?? error
  return (
    <form
      className="plan-form"
      onSubmit={(e) => {
        e.preventDefault()
        field.submit()
      }}
    >
      <label className="plan-field">
        <span className="plan-field__label">{planStrings.correctAmount}</span>
        <input type="text" inputMode="decimal" value={field.text} onChange={(e) => field.setText(e.target.value)} />
      </label>
      {message ? (
        <p role="alert" className="plan__error">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {planStrings.correctSave}
      </Button>
    </form>
  )
}

/** Bottom sheet that sets an Ingredient's Stock total (T10's Set total), prefilled with the correction's total. */
export function StockCorrectionSheet({ open, onClose, correction, onSave, busy, error }: StockCorrectionSheetProps): ReactNode {
  return (
    <BottomSheet open={open && correction !== null} onClose={onClose} title={planStrings.correctTitle(correction?.ingredient ?? '')}>
      {correction ? <TotalForm correction={correction} onSave={onSave} busy={busy} error={error} /> : null}
    </BottomSheet>
  )
}
