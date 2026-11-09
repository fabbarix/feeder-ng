import type { ReactNode } from 'react'
import type { StockWarning } from '../types'

export interface ShortfallNoticeProps {
  warning: StockWarning
  onCorrect: (warning: StockWarning) => void
  onDismiss: (warning: StockWarning) => void
}

/** The Stock shortfall warning with a one-tap "Correct Stock" and "Dismiss" (Stock stays floored at 0). */
export function ShortfallNotice(props: ShortfallNoticeProps): ReactNode {
  void props
  return null
}
