import type { ReactElement } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { ShortfallGroup } from '../lib/shortfall'

export interface ShortfallNoticeProps {
  /** One group per Cooked meal; the notice lists their rows, grouped by meal when there are several (PC-02). */
  groups: ShortfallGroup[]
  system?: UnitSystem
  /** `cooked`: Cook Mode's confirmation (the foot line "Stock stays where it is. Correct it if some was left."). `list`: Today and the Plan (a subline naming the meal). */
  placement?: 'cooked' | 'list'
  onCorrect: () => void
  onDismiss: () => void
}

/**
 * B9-45 (PC-02) STUB. ONE info status Tile (role status, never danger or spoil) for every shortfall of the Cooked meals: a title, DetailList rows
 * (key, state, detail), Correct Stock and Dismiss as secondary buttons. The developer builds it.
 */
export function ShortfallNotice(_props: ShortfallNoticeProps): ReactElement | null {
  throw new Error('B9-45: not built yet')
}
