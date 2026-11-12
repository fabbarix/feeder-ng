// A Leftover on Today (or the Plan): a row with its row Menu. STUB (red). Presentational: no API calls.
import type { Leftover, LeftoverActionKind } from '../../lib/leftovers'

export interface LeftoverRowProps {
  leftover: Leftover
  today: string
  /** A menu entry was chosen: the parent opens the matching LeftoverSheet. */
  onAction: (kind: LeftoverActionKind, leftover: Leftover) => void
}

export function LeftoverRow(_props: LeftoverRowProps) {
  return null
}
