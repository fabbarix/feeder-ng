import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { planStrings } from '../strings'
import type { StockWarning } from '../types'
import '../plan.css'

export interface ShortfallNoticeProps {
  warning: StockWarning
  onCorrect: (warning: StockWarning) => void
  onDismiss: (warning: StockWarning) => void
}

/** The Stock shortfall warning with a one-tap "Correct Stock" and "Dismiss" (Stock stays floored at 0). */
export function ShortfallNotice({ warning, onCorrect, onDismiss }: ShortfallNoticeProps): ReactNode {
  return (
    <Tile variant="status" status="danger" span="full" role="alert">
      <div className="plan__stack">
        <p className="plan__error">{warning.message}</p>
        <div className="plan__row">
          <Button variant="secondary" size="sm" onClick={() => onCorrect(warning)}>
            {planStrings.correctStock}
          </Button>
          <Button variant="tertiary" size="sm" onClick={() => onDismiss(warning)}>
            {planStrings.dismiss}
          </Button>
        </div>
      </div>
    </Tile>
  )
}
