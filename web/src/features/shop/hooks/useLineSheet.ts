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
}

export interface LineSheetController {
  entry: ListEntry | null
  group: RowGroup | null
  actions: LineAction[]
  open: (entry: ListEntry, group: RowGroup) => void
  close: () => void
  run: (action: LineAction) => void
}

export function useLineSheet(handlers: LineSheetHandlers): LineSheetController {
  const [sheet, setSheet] = useState<{ entry: ListEntry; group: RowGroup } | null>(null)
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
