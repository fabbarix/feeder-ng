// SR4: the To get view of the Scan screen: the Shopping List's open Lines not yet covered. A tap on a row ticks that Line by
// hand (no navigation); a row whose tick is in flight is busy and ignores taps. Its second line reads like a Scanned row's:
// the pack, then one tick and "x of y". With nothing left it says so. Render only (the rows come from lib/toGet).
import { EmptyState } from '../../../ui/EmptyState'
import { ListGroup, ListRow } from '../../../ui/ListRow'
import { Thumb } from '../../../ui/Thumb'
import type { ListEntry } from '../../shop/lib/lines'
import { rowValue } from '../../shop/lib/rows'
import type { ToGetRow } from '../lib/toGet'
import { scanStrings } from '../strings'
import { CoverMeta } from './CoverMeta'

export interface ToGetListProps {
  rows: ToGetRow[]
  /** the keys of the rows whose tick is in flight */
  pendingKeys: ReadonlySet<string>
  onTick: (entry: ListEntry) => void
}

export function ToGetList({ rows, pendingKeys, onTick }: ToGetListProps) {
  if (rows.length === 0) {
    return <EmptyState title={scanStrings.nothingToGet} description={scanStrings.nothingToGetHint} icon="success" />
  }
  return (
    <ListGroup label={scanStrings.toGetLabel}>
      {rows.map(({ entry, cover }) => {
        const busy = pendingKeys.has(entry.key)
        const value = rowValue(entry)
        return (
          <ListRow
            key={entry.key}
            title={entry.title}
            aria-label={scanStrings.tickLine(entry.title)}
            aria-busy={busy ? 'true' : undefined}
            onActivate={busy ? undefined : () => onTick(entry)}
            leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={48} />}
            meta={<CoverMeta size={entry.packLine} cover={busy ? { ...cover, done: true } : cover} />}
            value={value.value}
            subValue={value.subValue}
          />
        )
      })}
    </ListGroup>
  )
}
