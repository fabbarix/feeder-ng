import { Button } from '../../../ui/Button'
import { Tile } from '../../../ui/Tile'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineTileProps {
  entry: ListEntry
  onTick: (entry: ListEntry) => void
  onUntick: (entry: ListEntry) => void
  /** extras only; Lines come from the plan and cannot be deleted */
  onDelete?: (entry: ListEntry) => void
}

/** One list entry as a Bento Tile: a tick control, the title, the detail and the estimated cost. */
export function LineTile({ entry, onTick, onUntick, onDelete }: LineTileProps) {
  const label = entry.ticked ? shopStrings.untick(entry.title) : shopStrings.tickTitle(entry.title)
  return (
    <Tile as="article" className="line-tile" data-state={entry.ticked ? 'ticked' : 'open'}>
      <button
        type="button"
        className="line-tile__tick"
        aria-label={label}
        aria-pressed={entry.ticked}
        onClick={() => (entry.ticked ? onUntick(entry) : onTick(entry))}
      >
        <span aria-hidden="true" className="line-tile__check" />
      </button>
      <div className="line-tile__body">
        <p className="line-tile__title">{entry.title}</p>
        {entry.detail ? <p className="line-tile__detail">{entry.detail}</p> : null}
      </div>
      {entry.estimatedCost !== null ? <span className="line-tile__estimated-cost">{entry.estimatedCost}</span> : null}
      {entry.kind === 'extra' && onDelete ? (
        <Button variant="ghost" size="md" aria-label={shopStrings.deleteExtra(entry.title)} onClick={() => onDelete(entry)}>
          ×
        </Button>
      ) : null}
    </Tile>
  )
}
