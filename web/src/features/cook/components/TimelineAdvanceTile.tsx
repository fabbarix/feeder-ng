import type { ReactNode } from 'react'
import type { AdvanceGroup } from '../lib/timeline'

export interface TimelineAdvanceTileProps {
  groups: AdvanceGroup[]
  /** The Advance Step's own scope and Recipe Step index. */
  onMarkDone: (scope: string, step: number) => void
}

/**
 * STUB (CRS F). The Advance Steps of every Course above the timeline, grouped by Course (a `named` group has its Course
 * name as a sub-heading): done ones as "Done: <text>", pending ones with the warning look and a "Done" button, as the
 * single-Course AdvanceStepsTile. Renders nothing when no Advance Step is pending.
 */
export function TimelineAdvanceTile(_props: TimelineAdvanceTileProps): ReactNode {
  return null
}
