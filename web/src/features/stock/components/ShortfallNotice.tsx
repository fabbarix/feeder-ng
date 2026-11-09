import type { ReactElement } from 'react'
import type { StockWarning } from '../types'

export interface ShortfallNoticeProps {
  warning: StockWarning
  onCorrect: (warning: StockWarning) => void
  onDismiss: () => void
}

/** Shows warning.message with a "Correct Stock" button (one tap -> onCorrect) and "Dismiss". */
export function ShortfallNotice(props: ShortfallNoticeProps): ReactElement | null {
  void props
  throw new Error('TODO')
}
