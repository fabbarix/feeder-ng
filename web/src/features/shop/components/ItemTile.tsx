import { Button } from '../../../ui/Button'
import { Tile } from '../../../ui/Tile'
import type { ListItem } from '../lib/lines'
import { shopStrings } from '../strings'

export interface ItemTileProps {
  item: ListItem
  onTick: (item: ListItem) => void
  onUntick: (item: ListItem) => void
  /** extras only; Lines come from the plan and cannot be deleted */
  onDelete?: (item: ListItem) => void
}

/** One list item as a Bento Tile: a tick control, the title, the detail and the cost. */
export function ItemTile({ item, onTick, onUntick, onDelete }: ItemTileProps) {
  const label = item.ticked ? shopStrings.untick(item.title) : shopStrings.tickTitle(item.title)
  return (
    <Tile as="article" className="item-tile" data-state={item.ticked ? 'done' : 'open'}>
      <button
        type="button"
        className="item-tile__tick"
        aria-label={label}
        aria-pressed={item.ticked}
        onClick={() => (item.ticked ? onUntick(item) : onTick(item))}
      >
        <span aria-hidden="true" className="item-tile__check" />
      </button>
      <div className="item-tile__body">
        <p className="item-tile__title">{item.title}</p>
        {item.detail ? <p className="item-tile__detail">{item.detail}</p> : null}
      </div>
      {item.cost !== null ? <span className="item-tile__cost">{item.cost}</span> : null}
      {item.kind === 'extra' && onDelete ? (
        <Button variant="ghost" size="md" aria-label={shopStrings.deleteExtra(item.title)} onClick={() => onDelete(item)}>
          ×
        </Button>
      ) : null}
    </Tile>
  )
}
