// B9-34: the Change sheet of whatever tick a TickFlow is changing, shared by the Shop screen and Scan's To get (one mount each).
// TEST-AUTHOR STUB: the developer writes it (props pinned by TickChangeSheet.test.tsx).
import type { UnitSystem } from '../../../lib/units'
import type { TickFlow } from '../hooks/useTickFlow'

export interface TickChangeSheetProps {
  flow: Pick<TickFlow, 'changing' | 'change' | 'closeChange'>
  system: UnitSystem
  /** the Household's IANA zone; omitted, it is read from /api/me (app/useMe), and only while a tick is being changed */
  timeZone?: string
  /** Save or "Tick without adding" failed (the flow rejected): the screen shows its failure toast */
  onFailed?: (error: unknown) => void
}

export function TickChangeSheet(_props: TickChangeSheetProps) {
  return null
}
