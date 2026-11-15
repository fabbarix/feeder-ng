// RES-03: the notice for what did not sync, or synced twice. Stub: the developer implements it from ui/SyncNotice.test.tsx.
import type { ReactNode } from 'react'

export interface SyncNoticeRow {
  /** The key, body-strong ("Sam", "You"). */
  key: ReactNode
  /** The amount at the row's end, tabular, in the notice's tone. */
  amount?: ReactNode
  /** The time, muted, under the key. */
  time?: ReactNode
}

export interface SyncNoticeAction {
  label: string
  onClick: () => void
}

export interface SyncNoticeProps {
  tone: 'danger' | 'info'
  /** The headline, body-strong. */
  title: ReactNode
  /** The muted subline. */
  subtitle?: ReactNode
  /** R-E rows, one per addition. */
  rows?: SyncNoticeRow[]
  /** Secondary small Buttons, in order. */
  actions?: SyncNoticeAction[]
}

export function SyncNotice(_props: SyncNoticeProps): ReactNode {
  return null
}

/** The notices to show: newest first (the input is oldest first), at most `max`, and how many were left out. */
export function stackNotices<T>(_oldestFirst: readonly T[], _max = 3): { shown: T[]; more: number } {
  return { shown: [], more: 0 }
}

export function SyncNoticeStack(_props: { notices: readonly (SyncNoticeProps & { id: string })[] }): ReactNode {
  return null
}
