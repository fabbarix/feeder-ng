// DS-SHOP (docs/design/system.md §3): a Shop Line is a ListRow: [tick] [Thumb] [name over one meta line] [quantity column].
// The whole row opens the Line's sheet; the tick is the only other control. Render only: the rules are in lib/rows.
import { ListRow } from '../../../ui/ListRow'
import { Icon } from '../../../ui/Icon'
import { Thumb } from '../../../ui/Thumb'
import { rowMeta, rowValue, type RowGroup, type RowMeta } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineRowProps {
  entry: ListEntry
  group: RowGroup
  onTick?: (entry: ListEntry) => void
  onUntick?: (entry: ListEntry) => void
  /** the row was tapped: open its sheet with the group it is in */
  onOpen: (entry: ListEntry, group: RowGroup) => void
  /** b8-polish: the narrow layout shows the short Restock reason; the screen decides (useNarrowChips) */
  compact?: boolean
}

export function LineRow({ entry, group, onTick, onUntick, onOpen, compact }: LineRowProps) {
  const ticked = group === 'ticked'
  const meta = rowMeta(entry, { compact })
  const { value, subValue } = rowValue(entry)
  // round 2: the label is stable ("Tick X") and the state is aria-pressed; the ticked mark is a plain check in a CSS circle
  const control =
    group === 'not-needed' ? undefined : (
      <button
        type="button"
        className="line-row__tick"
        aria-label={shopStrings.tickTitle(entry.title)}
        aria-pressed={ticked}
        onClick={() => (ticked ? onUntick?.(entry) : onTick?.(entry))}
      >
        {ticked ? <Icon name="tick" size={24} weight="bold" /> : null}
      </button>
    )
  return (
    <ListRow
      title={entry.title}
      onActivate={() => onOpen(entry, group)}
      haspopup="dialog"
      data-state={group}
      leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={40} />}
      control={control}
      meta={metaNode(meta)}
      metaStatus={meta.status}
      value={value}
      subValue={subValue}
    />
  )
}

/** The meta text; with a fullText the visible compact text is named by the full one for assistive technology (b8-polish). */
function metaNode(meta: RowMeta) {
  if (!meta.text) return undefined
  if (!meta.fullText) return meta.text
  return (
    <span role="img" aria-label={meta.fullText}>
      {meta.text}
    </span>
  )
}
