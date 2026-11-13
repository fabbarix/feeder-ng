// DS-SHOP (docs/design/system.md §3): a Shop Line is a ListRow: [tick] [Thumb] [name over one meta line] [quantity column].
// The whole row opens the Line's sheet; the tick is the only other control. Render only: the rules are in lib/rows.
import { ListRow } from '../../../ui/ListRow'
import { Icon } from '../../../ui/Icon'
import { Thumb } from '../../../ui/Thumb'
import { rowMeta, rowValue, type RowGroup } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineRowProps {
  entry: ListEntry
  group: RowGroup
  onTick?: (entry: ListEntry) => void
  onUntick?: (entry: ListEntry) => void
  /** the row was tapped: open its sheet with the group it is in */
  onOpen: (entry: ListEntry, group: RowGroup) => void
}

export function LineRow({ entry, group, onTick, onUntick, onOpen }: LineRowProps) {
  const ticked = group === 'ticked'
  const meta = rowMeta(entry)
  const { value, subValue } = rowValue(entry)
  const control =
    group === 'not-needed' ? undefined : (
      <button
        type="button"
        className="line-row__tick"
        aria-label={ticked ? shopStrings.untick(entry.title) : shopStrings.tickTitle(entry.title)}
        aria-pressed={ticked}
        onClick={() => (ticked ? onUntick?.(entry) : onTick?.(entry))}
      >
        {ticked ? <Icon name="tick" size={24} weight="fill" /> : null}
      </button>
    )
  return (
    <ListRow
      title={entry.title}
      onActivate={() => onOpen(entry, group)}
      data-state={group}
      leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={40} />}
      control={control}
      meta={meta.text || undefined}
      metaStatus={meta.status}
      value={value}
      subValue={subValue}
    />
  )
}
