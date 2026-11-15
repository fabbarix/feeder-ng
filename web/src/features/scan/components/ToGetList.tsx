// SR4: the To get view of the Scan screen: the Shopping List's open Lines not yet covered. A tap on a row ticks that Line by
// hand (no navigation); a row whose tick is in flight is busy and ignores taps. Its second line reads like a Scanned row's:
// the pack, then one tick and "x of y". With nothing left it says so; B9-43 (SSP-09): with every Line ticked it shows the Shop's
// "Shopping List complete" tile instead. Render only (the rows come from lib/toGet).
import { EmptyState } from '../../../ui/EmptyState'
import { ListGroup, ListRow } from '../../../ui/ListRow'
import { Thumb } from '../../../ui/Thumb'
import type { ListEntry } from '../../shop/lib/lines'
import { rowNames, rowValue } from '../../shop/lib/rows'
import type { ToGetRow } from '../lib/toGet'
import { scanStrings } from '../strings'
import { CelebrationTile, type CelebrationTileProps } from '../../shop/components/CelebrationTile'
import { CoverMeta } from './CoverMeta'

export interface ToGetListProps {
  rows: ToGetRow[]
  /** the keys of the rows whose tick is in flight */
  pendingKeys: ReadonlySet<string>
  onTick: (entry: ListEntry) => void
  /** B9-43 (SSP-09): with nothing left to get, the Shop's "Shopping List complete" tile (the same CelebrationTile); omitted = the plain empty state */
  celebration?: CelebrationTileProps | null
}

export function ToGetList({ rows, pendingKeys, onTick, celebration }: ToGetListProps) {
  if (rows.length === 0) {
    if (celebration) return <CelebrationTile {...celebration} />
    return <EmptyState title={scanStrings.nothingToGet} description={scanStrings.nothingToGetHint} icon="success" />
  }
  // batch w5a (P38): a Line and its "more since your tick" row, or a Line and an Ingredient extra, are told apart by name
  const names = rowNames(rows.map((r) => r.entry))
  return (
    <ListGroup label={scanStrings.toGetLabel}>
      {rows.map(({ entry, cover, byHand }) => {
        const busy = pendingKeys.has(entry.key)
        const value = rowValue(entry)
        return (
          <ListRow
            key={entry.key}
            title={entry.title}
            aria-label={scanStrings.tickLine(names.get(entry.key) ?? entry.title)}
            busy={busy}
            onActivate={() => onTick(entry)}
            leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={48} />}
            meta={<CoverMeta size={entry.packLine} cover={busy ? { ...cover, done: true } : cover} byHand={byHand} />}
            value={value.value}
            subValue={value.subValue}
            // batch w5a (P23): a row with a pack ("3 × Passata 700 g · 0 of 1.53 kg") wraps its second line, the tick and its "x of y"
            // together, rather than be cut beside the value and its Price (390 and 834)
            data-meta-wrap={entry.packLine ? 'true' : undefined}
          />
        )
      })}
    </ListGroup>
  )
}
