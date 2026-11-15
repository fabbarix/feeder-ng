// B9-50 (SSP-08): "Is it one of these?": the name matches of a receipt line, Products first, as a radiogroup of choice chips (our own
// control: role radio, aria-checked, a roving tab stop). A chosen chip wears the selected container, its ring and a Check (A11Y-06). The
// arrows only move the focus; Space, Enter or a click chooses, because choosing a Line moves the sheet on. Render only.
import { useId } from 'react'
import { Icon } from '../../../ui/Icon'
import { useRovingRadios } from '../../../ui/fields/useRovingRadios'
import '../../../ui/ChoiceChip.css'
import type { UnitSystem } from '../../../lib/units'
import { matchKey, matchNote } from '../lib/receiptMatchStep'
import { newProductStrings } from '../newProductStrings'
import type { ReceiptMatch } from './NewProductSheet'
import './NewProductSheet.css'

export interface ReceiptMatchChipsProps {
  matches: ReceiptMatch[]
  /** the chosen match's key (lib/receiptMatchStep matchKey), or null */
  value: string | null
  system: UnitSystem
  onPick: (match: ReceiptMatch) => void
}

export function ReceiptMatchChips({ matches, value, system, onPick }: ReceiptMatchChipsProps) {
  const labelId = useId()
  const byKey = new Map(matches.map((m) => [matchKey(m), m]))
  const roving = useRovingRadios(
    matches.map((m) => ({ value: matchKey(m) })),
    value,
    (key: string) => {
      const m = byKey.get(key)
      if (m) onPick(m)
    },
    'manual',
  )
  return (
    <div className="new-product__lines new-product__matches">
      <h3 id={labelId} className="new-product__label" tabIndex={-1} data-step-heading="">
        {newProductStrings.receipt.matches}
      </h3>
      <div role="radiogroup" aria-labelledby={labelId} className="new-product__chips">
        {matches.map((m) => {
          const key = matchKey(m)
          const checked = key === value
          return (
            <button
              key={key}
              ref={roving.register(key)}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={key === roving.tabStop ? 0 : -1}
              className="choice-chip new-product__match"
              data-kind={m.kind}
              onClick={() => onPick(m)}
              onKeyDown={(e) => roving.onKeyDown(e, key)}
            >
              {checked ? <Icon name="selected" size={16} weight="bold" className="choice-chip__check" /> : null}
              <span className="choice-chip__lead" aria-hidden="true">
                <Icon name={m.kind === 'product' ? 'products' : 'successOpen'} size={20} />
              </span>
              <span className="choice-chip__label">{m.name}</span>{' '}
              <span className="choice-chip__note">{matchNote(m, system)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
