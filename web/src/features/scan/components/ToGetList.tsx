// SR4: the To get view of the Scan screen: the Shopping List's open Lines not yet scanned. A tap opens the Shop screen,
// where a Line is ticked by hand or marked Not needed. Render only.
import { ListGroup, ListRow } from '../../../ui/ListRow'
import { Thumb } from '../../../ui/Thumb'
import type { ListEntry } from '../../shop/lib/lines'
import { rowMeta, rowValue } from '../../shop/lib/rows'
import { scanStrings } from '../strings'

export interface ToGetListProps {
  entries: ListEntry[]
  onOpen: () => void
}

export function ToGetList({ entries, onOpen }: ToGetListProps) {
  return (
    <ListGroup label={scanStrings.toGetLabel}>
      {entries.map((entry) => {
        const meta = rowMeta(entry)
        const value = rowValue(entry)
        return (
          <ListRow
            key={entry.key}
            title={entry.title}
            onActivate={onOpen}
            leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={48} />}
            meta={meta.text || undefined}
            metaStatus={meta.status}
            value={value.value}
            subValue={value.subValue}
          />
        )
      })}
    </ListGroup>
  )
}
