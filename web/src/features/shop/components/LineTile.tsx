import type { ReactNode } from 'react'
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { IconButton } from '../../../ui/IconButton'
import { Menu } from '../../../ui/Menu'
import { Tile } from '../../../ui/Tile'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineTileProps {
  entry: ListEntry
  onTick: (entry: ListEntry) => void
  onUntick: (entry: ListEntry) => void
  /** extras only; Lines come from the plan and cannot be deleted */
  onDelete?: (entry: ListEntry) => void
  /** R2-4: a leading visual (an Ingredient thumbnail later), rendered in `.line-tile__lead` between the tick and the text. */
  lead?: ReactNode
  /** B5-SH: an open Line gets a Menu with "Not needed" when this is given. */
  onNotNeeded?: (entry: ListEntry) => void
  /**
   * B5-SH: a "Mark it" button beside the hint, shown only when this is given and the entry has a hint. The Shop screen
   * passes it once the Plan page can open To confirm for a slot (`/plan#to-confirm`, team F1).
   */
  onMarkIt?: (entry: ListEntry) => void
}

/**
 * One list entry as a Bento Tile: the tick control (44 px, a ring when open, a filled tick when ticked), the name with
 * its quantity and pack suggestion, the estimated cost (only when there is a Price) and, for extras, a note icon and a
 * compact Delete IconButton. Render only.
 */
export function LineTile({ entry, onTick, onUntick, onDelete, lead, onNotNeeded, onMarkIt }: LineTileProps) {
  const label = entry.ticked ? shopStrings.untick(entry.title) : shopStrings.tickTitle(entry.title)
  const notNeeded = onNotNeeded && entry.kind === 'line' && !entry.ticked ? onNotNeeded : null
  return (
    <Tile as="article" className="line-tile" data-lead={lead ? 'true' : undefined} data-state={entry.ticked ? 'ticked' : 'open'}>
      <button
        type="button"
        className="line-tile__tick"
        aria-label={label}
        aria-pressed={entry.ticked}
        onClick={() => (entry.ticked ? onUntick(entry) : onTick(entry))}
      >
        {entry.ticked ? <Icon name="tick" size={24} weight="fill" /> : null}
      </button>
      {lead ? <span className="line-tile__lead">{lead}</span> : null}
      <div className="line-tile__body">
        <p className="line-tile__title">{entry.title}</p>
        {entry.quantityText ? <p className="line-tile__quantity">{entry.quantityText}</p> : null}
        {entry.packLine ? <p className="line-tile__pack">{entry.packLine}</p> : null}
        {entry.hint ? (
          <div className="line-tile__hint-row">
            <p className="line-tile__hint">{entry.hint}</p>
            {onMarkIt ? (
              <Button variant="tertiary" size="sm" aria-label={shopStrings.markItFor(entry.title)} onClick={() => onMarkIt(entry)}>
                {shopStrings.markIt}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="line-tile__end">
        {entry.kind === 'extra' ? (
          <span className="line-tile__extra-icon" aria-hidden="true">
            <Icon name="extra" size={20} />
          </span>
        ) : null}
        {entry.estimatedCost !== null ? <span className="line-tile__estimated-cost">{entry.estimatedCost}</span> : null}
        {notNeeded ? <Menu label={shopStrings.lineMenu(entry.title)} items={[{ id: 'not-needed', label: shopStrings.notNeeded, icon: 'minus', onSelect: () => notNeeded(entry) }]} /> : null}
        {entry.kind === 'extra' && onDelete ? <IconButton icon="delete" size="compact" label={shopStrings.deleteExtra(entry.title)} onClick={() => onDelete(entry)} /> : null}
      </span>
    </Tile>
  )
}
