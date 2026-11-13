// DS-TODAY: the state behind "Show N more" / "Show less": collapsed by default, toggles, and collapses again when the list
// shrinks to fit the cap (so a longer list later starts collapsed again).
import { useState } from 'react'
import { capRows, SHOW_MORE_CAP, type CappedRows } from './showMore'

export interface ShowMore<T> extends CappedRows<T> {
  expanded: boolean
  toggle: () => void
}

export function useShowMore<T>(rows: readonly T[], cap: number = SHOW_MORE_CAP): ShowMore<T> {
  const [expanded, setExpanded] = useState(false)
  const capped = rows.length > cap
  // Rows handled down to the cap: nothing to expand any more, so the expansion is forgotten (set during render, not in an effect).
  if (!capped && expanded) setExpanded(false)
  const shown = capRows(rows, cap, expanded && capped)
  return { ...shown, expanded: expanded && capped, toggle: () => setExpanded((e) => !e) }
}
