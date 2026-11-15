// B9-29 (SSP-17, mock ssp-17-keep-date.html): "Flour: good until?", the sheet the Keep toast's Change opens. A radiogroup of
// choice chips (Today, Tomorrow, In 3 days, In a week, Pick a date); the primary says the day. Render only: the dates are lib/keepDates.
import { useId, useState, type ReactElement } from 'react'
import { BottomSheet, Button, DateField, FormActions, Icon } from '../../../ui'
import '../../../ui/ChoiceChip.css'
import { useRovingRadios } from '../../../ui/fields/useRovingRadios'
import { capitalise } from '../lib/display'
import { isKeepDate, keepChoices, keepUntilLabel, type KeepChoiceId } from '../lib/keepDates'
import { stockStrings as strings } from '../strings'
import type { StockLot } from '../types'

type Choice = KeepChoiceId | 'pick'

export interface KeepDateSheetProps {
  open: boolean
  lot: Pick<StockLot, 'id' | 'ingredientName'> | null
  /** The household's date (YYYY-MM-DD). */
  today: string
  onClose: () => void
  /** Keeps the Lot good until this ISO date. The screen closes the sheet. */
  onKeep: (date: string) => Promise<unknown> | void
}

export function KeepDateSheet({ open, lot, today, onClose, onKeep }: KeepDateSheetProps): ReactElement {
  return (
    <BottomSheet open={open && lot !== null} onClose={onClose} title={lot ? strings.keepDate.title(capitalise(lot.ingredientName)) : ''}>
      {open && lot ? <KeepDateForm key={lot.id} today={today} onKeep={onKeep} /> : null}
    </BottomSheet>
  )
}

function KeepDateForm({ today, onKeep }: { today: string; onKeep: KeepDateSheetProps['onKeep'] }) {
  const formId = useId()
  const labelId = useId()
  const choices = keepChoices(today)
  const [choice, setChoice] = useState<Choice>('today')
  const [picked, setPicked] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const options: { value: Choice; label: string; note?: string }[] = [
    ...choices.map((c) => ({ value: c.id as Choice, label: c.label, note: c.dayLabel })),
    { value: 'pick', label: strings.keepDate.pick },
  ]
  const roving = useRovingRadios(options.map((o) => ({ value: o.value })), choice, setChoice)
  const date = choice === 'pick' ? picked : (choices.find((c) => c.id === choice)?.date ?? today)
  const valid = isKeepDate(date, today)

  const submit = async () => {
    if (!valid) {
      setError(strings.keepDate.choose)
      return
    }
    setBusy(true)
    try {
      await onKeep(date)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      id={formId}
      className="keep-sheet"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="keep-sheet__why">{strings.keepDate.why}</p>
      <p id={labelId} className="visually-hidden">
        {strings.keepDate.choices}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="keep-sheet__choices">
        {options.map((o) => (
          <button
            key={o.value}
            ref={roving.register(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === choice}
            data-selected={o.value === choice}
            tabIndex={o.value === roving.tabStop ? 0 : -1}
            className="choice-chip"
            data-variant={o.value === 'pick' ? 'quiet' : o.value === choice ? 'filled' : 'outline'}
            onClick={() => {
              setChoice(o.value)
              setError(null)
            }}
            onKeyDown={(e) => roving.onKeyDown(e, o.value)}
          >
            {o.value === 'pick' ? (
              <span className="choice-chip__lead" aria-hidden="true">
                <Icon name="planEmpty" size={20} />
              </span>
            ) : null}
            <span className="choice-chip__label">{o.label}</span>
            {o.note ? (
              <>
                {' '}
                <span className="choice-chip__note">{o.note}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      {choice === 'pick' ? (
        <DateField
          label={strings.keepDate.field}
          value={picked}
          min={today}
          today={today}
          onChange={(v) => {
            setPicked(v)
            setError(null)
          }}
          error={error ?? undefined}
        />
      ) : null}
      <FormActions
        primary={
          <Button type="submit" loading={busy}>
            {valid ? keepUntilLabel(date) : strings.keep}
          </Button>
        }
      />
    </form>
  )
}
