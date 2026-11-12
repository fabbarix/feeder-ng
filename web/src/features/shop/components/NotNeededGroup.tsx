import type { ReactNode } from 'react'
import type { ListEntry } from '../lib/lines'

export interface NotNeededGroupProps {
  entries: ListEntry[]
  /** "Needed after all" on one entry */
  onNeededAfterAll: (entry: ListEntry) => void
  /** the Ingredient's Picture slot, as ShoppingBody gives the other tiles */
  lead?: (entry: ListEntry) => ReactNode
}

/** B5-SH stub: the collapsed "Not needed (N)" group at the end of the list. */
export function NotNeededGroup(props: NotNeededGroupProps) {
  void props
  return null
}
