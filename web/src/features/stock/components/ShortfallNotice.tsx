import type { ReactElement } from 'react'
import { Button, Tile } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { shortfallMessage } from '../lib/shortfall'
import type { StockWarning } from '../types'
import { stockStrings as strings } from '../strings'
import { uiStrings } from '../../../ui/strings'

export interface ShortfallNoticeProps {
  warning: StockWarning
  onCorrect: (warning: StockWarning) => void
  onDismiss: () => void
  system?: UnitSystem
}

/** Shows the shortfall sentence with a "Correct Stock" button (one tap -> onCorrect) and "Dismiss". */
export function ShortfallNotice({ warning, onCorrect, onDismiss, system = 'metric' }: ShortfallNoticeProps): ReactElement | null {
  return (
    <Tile as="section" tone="spoil">
      <p className="shortfall-notice__text">{shortfallMessage(warning, system)}</p>
      <div className="shortfall-notice__actions">
        <Button variant="tonal" onClick={() => onCorrect(warning)}>
          {strings.correctStock}
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          {uiStrings.dismiss}
        </Button>
      </div>
    </Tile>
  )
}
