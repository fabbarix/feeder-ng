import type { ReactNode } from 'react'
import type { PreferenceRow } from '../lib/preferenceRows'
import type { PreferenceState } from '../types'

export interface PreferenceTableProps {
  /** Names the table: "Preferences for <recipeName>" (screen-reader-only caption). */
  recipeName: string
  /** One row per Member, from lib/preferenceRows (the linked Member first). */
  rows: PreferenceRow[]
  /** A state button was pressed: the hook applies nextState. */
  onToggle: (memberId: number, tapped: Exclude<PreferenceState, 'none'>) => void
  /** The row to highlight (a #preference-member-<id> link). */
  highlightedMemberId?: number | null
  /** Admins get "Add Members" in the empty state. */
  isAdmin?: boolean
  /** The preferences failed to load: an ErrorState with a retry. */
  error?: boolean
  onRetry?: () => void
}

/** STUB (PT, step 1): a real <table>, one row per Member, one column per state (rx-pt.md section 5.3). */
export function PreferenceTable(props: PreferenceTableProps): ReactNode {
  void props
  return null
}
