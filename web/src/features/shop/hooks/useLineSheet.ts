// DS-SHOP (docs/design/system.md §3): the Line sheet a row opens. It holds the entry and its group; an action runs its handler
// once and closes the sheet. An action the sheet does not offer is ignored (a stale button cannot Delete a Line).
import { useState } from 'react'
import { lineActions, type LineAction, type RowGroup } from '../lib/rows'
import type { ListEntry } from '../lib/lines'

export interface LineSheetHandlers {
  onNotNeeded: (entry: ListEntry) => void
  onNeededAfterAll: (entry: ListEntry) => void
  onMarkIt: (entry: ListEntry) => void
  onDelete: (entry: ListEntry) => void
  /** B9-34 (SSP-18): the ticked sheet's Change amount and Untick */
  onChangeAmount?: (entry: ListEntry) => void
  onUntick?: (entry: ListEntry) => void
}

export interface LineSheetController {
  entry: ListEntry | null
  group: RowGroup | null
  actions: LineAction[]
  open: (entry: ListEntry, group: RowGroup) => void
  close: () => void
  run: (action: LineAction) => void
}

/**
 * `resolve` (B9-34) gives the current copy of the held entry after the list refreshed (a Take back changes a ticked entry's additions
 * while its sheet is open); without it, or when it finds none, the entry as it was opened stays.
 */
export function useLineSheet(handlers: LineSheetHandlers, resolve?: (entry: ListEntry, group: RowGroup) => ListEntry | null): LineSheetController {
  const [held, setSheet] = useState<{ entry: ListEntry; group: RowGroup } | null>(null)
  const sheet = held ? { entry: resolve?.(held.entry, held.group) ?? held.entry, group: held.group } : null
  const actions = sheet ? lineActions(sheet.entry, sheet.group) : []

  const run = (action: LineAction) => {
    if (!sheet || !actions.includes(action)) return
    const { entry } = sheet
    setSheet(null)
    switch (action) {
      case 'not-needed':
        handlers.onNotNeeded(entry)
        return
      case 'needed-after-all':
        handlers.onNeededAfterAll(entry)
        return
      case 'mark-it':
        handlers.onMarkIt(entry)
        return
      case 'delete':
        handlers.onDelete(entry)
        return
      case 'change-amount':
        handlers.onChangeAmount?.(entry)
        return
      case 'untick':
        handlers.onUntick?.(entry)
        return
    }
  }

  return {
    entry: sheet?.entry ?? null,
    group: sheet?.group ?? null,
    actions,
    open: (entry, group) => setSheet({ entry, group }),
    close: () => setSheet(null),
    run,
  }
}
