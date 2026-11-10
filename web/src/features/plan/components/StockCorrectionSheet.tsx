import type { ReactNode } from 'react'
import { BottomSheet, Button, NumberField } from '../../../ui'
import type { Correction } from '../lib/cook'
import { keepEnterInFields } from './RulesEditors'
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
      onKeyDown={keepEnterInFields}
      onSubmit={(e) => {
        e.preventDefault()
        field.submit()
      }}
    >
      <NumberField label={planStrings.correctAmount} value={field.value} onChange={field.setValue} min={0} />
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
