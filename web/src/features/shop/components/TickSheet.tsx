// B9-34 (SSP-01): the Change sheet "Garlic: how much?" (mocks/ssp-01-tick-change.html). One tap ticks, so this sheet only changes what a
// tick added: the R-E row of what it added, one radiogroup (the pack, what the Line needed, Other amount), Save, and "Tick without
// adding". The header has the circular Close; the footer has no Cancel. Render and wiring only: the choices are lib/tickAmount's.
import { useEffect, useId, useRef, useState } from 'react'
import { baseUnitLabel, formatQuantity, type UnitSystem } from '../../../lib/units'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { DetailList, DetailRow } from '../../../ui/DetailList'
import { Icon } from '../../../ui/Icon'
import { FormActions } from '../../../ui/FormActions'
import { NumberField } from '../../../ui/fields/NumberField'
import { RadioCards } from '../../../ui/fields/RadioCards'
import { additionDetail } from '../lib/tickAmount'
import { shopStrings } from '../strings'
import type { BaseUnit } from '../types'

export interface TickSheetProps {
  open: boolean
  onClose: () => void
  name: string
  baseUnit: BaseUnit
  system: UnitSystem
  /** Base Units the viewer's tick added; 0 = none (the "Added when you ticked it" row is left out) */
  added: number
  /** ISO instant of that tick */
  tickedAt: string
  /** the Household's IANA zone; null/omitted while unknown (the row then shows no time, never the device's) */
  timeZone?: string | null
  /** the pack (label as tickChoices words it) and what the Line needed; null = not offered */
  choices: { pack: { label: string; amount: number } | null; need: { amount: number } | null }
  /** Base Units for this tick: > 0 sets the amount, 0 is "Tick without adding" */
  onSubmit: (quantity: number) => void
  /** the change is in flight: Save shows its spinner */
  busy?: boolean
  /** B9-54 (RES-03): the Tick is still in the offline queue: the sheet says what goes to Stock when it syncs, and that nothing is sent meanwhile */
  waiting?: boolean
}

type Choice = 'pack' | 'need' | 'other'

/** The choice that matches what was added; with nothing added, the first offered amount. */
function startChoice(added: number, choices: TickSheetProps['choices']): Choice {
  if (added > 0) {
    if (choices.pack && choices.pack.amount === added) return 'pack'
    if (choices.need && choices.need.amount === added) return 'need'
    return 'other'
  }
  if (choices.pack) return 'pack'
  if (choices.need) return 'need'
  return 'other'
}

export function TickSheet({ open, onClose, name, baseUnit, system, added, tickedAt, timeZone, choices, onSubmit, busy, waiting = false }: TickSheetProps) {
  const formId = useId()
  const groupLabelId = useId()
  const [choice, setChoice] = useState<Choice>(() => startChoice(added, choices))
  const [other, setOther] = useState<number | null>(() => (startChoice(added, choices) === 'other' && added > 0 ? added : null))
  const [error, setError] = useState<string | null>(null)
  const otherRef = useRef<HTMLDivElement>(null)
  const focusOther = useRef(false)

  // Choosing Other amount reveals the field and moves the focus into it.
  useEffect(() => {
    if (choice !== 'other' || !focusOther.current) return
    focusOther.current = false
    otherRef.current?.querySelector('input')?.focus()
  }, [choice])

  const choose = (next: Choice) => {
    if (next === 'other' && choice !== 'other') focusOther.current = true
    setChoice(next)
    setError(null)
  }

  const amount = (n: number) => formatQuantity(n, baseUnit, system)
  const options = [
    ...(choices.pack ? [{ value: 'pack' as const, title: choices.pack.label }] : []),
    ...(choices.need ? [{ value: 'need' as const, title: `${shopStrings.whatLineNeeded} · ${amount(choices.need.amount)}` }] : []),
    { value: 'other' as const, title: shopStrings.otherAmount },
  ]

  const submit = () => {
    if (choice === 'pack' && choices.pack) return onSubmit(choices.pack.amount)
    if (choice === 'need' && choices.need) return onSubmit(choices.need.amount)
    if (other === null) return setError(shopStrings.enterAmount)
    if (other <= 0) return setError(shopStrings.mustBePositive)
    setError(null)
    onSubmit(other)
  }

  const detail = additionDetail({ who: '', mine: true, by: 'hand', quantity: added, clientUuid: null, tickedAt, syncedAt: tickedAt }, timeZone)
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={shopStrings.changeTitle(name)}
      footer={
        <FormActions
          primary={
            <Button type="submit" form={formId} loading={busy}>
              {shopStrings.save}
            </Button>
          }
          secondary={
            <Button variant="secondary" disabled={busy} onClick={() => onSubmit(0)}>
              {shopStrings.tickOnly}
            </Button>
          }
        />
      }
    >
      <form
        id={formId}
        className="shop-sheet-form tick-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {waiting ? (
          <>
            <p className="tick-sheet__waiting">
              <Icon name="duration" size={16} />
              <span>{added > 0 ? shopStrings.waitingGoesToStock(amount(added)) : shopStrings.waitingToSync}</span>
            </p>
            <p className="tick-sheet__hint">{shopStrings.changeWaitingHint}</p>
          </>
        ) : added > 0 ? (
          <DetailList tone="success" className="tick-sheet__added">
            <DetailRow label={shopStrings.addedWhenTicked} state={shopStrings.plusAmount(amount(added))} detail={detail} />
          </DetailList>
        ) : null}
        <p id={groupLabelId} className="visually-hidden">
          {shopStrings.amountChoices}
        </p>
        <RadioCards<Choice> bare labelledBy={groupLabelId} options={options} value={choice} onChange={choose} />
        {choice === 'other' ? (
          <div ref={otherRef} className="tick-sheet__other">
            <NumberField
              size="full"
              label={shopStrings.howMuch}
              value={other}
              onChange={(next) => {
                setOther(next)
                setError(null)
              }}
              min={0}
              hideStepper
              unit={baseUnitLabel(baseUnit, 'metric', other ?? undefined)}
              error={error ?? undefined}
            />
          </div>
        ) : null}
      </form>
    </BottomSheet>
  )
}
