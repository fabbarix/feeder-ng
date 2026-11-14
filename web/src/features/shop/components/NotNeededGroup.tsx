// B5-SH (DS-SHOP): the collapsed "Not needed (N)" group at the end of the list. Closed, it shows only its toggle; opened, its
// Lines are rows (no tick: a Not needed Line is neither open nor ticked). The row opens the Line's sheet. Render only.
import { useId, useState } from 'react'
import { Icon } from '../../../ui/Icon'
import { ListGroup } from '../../../ui/ListRow'
import type { RowGroup } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'
import { LineRow } from './LineRow'

export interface NotNeededGroupProps {
  entries: ListEntry[]
  /** a row was tapped: its sheet offers "Needed after all" */
  onOpen: (entry: ListEntry, group: RowGroup) => void
  /** b8-polish: a narrow screen shows the short Restock reason, as in the other groups (the screen decides, useNarrowChips) */
  compact?: boolean
}

export function NotNeededGroup({ entries, onOpen, compact }: NotNeededGroupProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if (entries.length === 0) return null
  return (
    <section className="shop-not-needed">
      <button type="button" className="shop-not-needed__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {shopStrings.notNeededGroup(entries.length)}
        <Icon name="chevron" size={20} className="shop-not-needed__chevron" />
      </button>
      {open ? (
        <div id={panelId} className="shop-lines">
          <ListGroup label={shopStrings.notNeeded}>
            {entries.map((entry) => (
              <LineRow key={entry.key} entry={entry} group="not-needed" onOpen={onOpen} compact={compact} />
            ))}
          </ListGroup>
        </div>
      ) : null}
    </section>
  )
}
