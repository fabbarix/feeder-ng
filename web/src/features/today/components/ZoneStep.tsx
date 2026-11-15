import type { ReactElement } from 'react'
import { Button } from '../../../ui'
import type { ZoneRow } from '../lib/currencyGuess'
import { todayStrings as s } from '../strings'

export interface ZoneStepProps {
  rows: ZoneRow[]
  /** An Admin on the current step: each row has its Change. */
  canChange: boolean
  busy: boolean
  onChange: (id: ZoneRow['id']) => void
  /** "Looks right"; absent for a plain User. */
  onConfirm?: () => void
}

/**
 * Step 1's detected settings as R-E rows on the soft tint: the key, the value as the state at the row's end, the muted detail on one line
 * under the key, and a secondary Change ending the detail line. "Looks right" saves both.
 */
export function ZoneStep({ rows, canChange, busy, onChange, onConfirm }: ZoneStepProps): ReactElement {
  return (
    <>
      <ul className="setup-facts" aria-label={s.setupFacts.label}>
        {rows.map((row) => (
          <li key={row.id} className="setup-fact" data-change={canChange ? 'true' : undefined}>
            <span className="setup-fact__key">{row.key}</span>
            <span className="setup-fact__state">{row.state}</span>
            <span className="setup-fact__detail">{row.detail}</span>
            {canChange ? (
              <Button variant="secondary" size="sm" className="setup-fact__change" aria-label={row.changeLabel} onClick={() => onChange(row.id)}>
                {s.setupFacts.change}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {onConfirm ? (
        <div className="setup-step__actions">
          <Button icon="tick" loading={busy} data-step-primary="" onClick={onConfirm}>
            {s.setupSteps.zone.action}
          </Button>
        </div>
      ) : null}
    </>
  )
}
