// DS-SHOP (docs/design/system.md §3): a Shop Line is a ListRow: [tick] [Thumb] [name over one meta line] [quantity column].
// The whole row opens the Line's sheet; the tick is the only other control. Render only: the rules are in lib/rows.
// B9-34: the meta says what a tick did to Stock (SSP-01) or that more is needed since a tick (SSP-02); its compact form is ListRow's own
// (shown by the width of the row's text column, SSP-05); the row carries its key for focus after it leaves its list (A11Y-07).
import { ListRow } from '../../../ui/ListRow'
import { Icon } from '../../../ui/Icon'
import { Thumb } from '../../../ui/Thumb'
import { metaWidth, rowMeta, rowValue, type RowGroup, type RowMeta } from '../lib/rows'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface LineRowProps {
  entry: ListEntry
  group: RowGroup
  onTick?: (entry: ListEntry) => void
  onUntick?: (entry: ListEntry) => void
  /** the row was tapped: open its sheet with the group it is in */
  onOpen: (entry: ListEntry, group: RowGroup) => void
  /** B9-34: this row's tick is in flight (aria-busy and aria-disabled; it stays focusable) */
  pending?: boolean
  /** B9-54 (RES-03): 'failed' = the Tick of this (open) row was refused on sync: "Tick not synced", the danger bar. A waiting Tick is `entry.sync`. */
  sync?: 'pending' | 'failed'
  /** batch w5a (P38): the row's name when its title is not unique on the page (lib/rows rowNames); default the title */
  name?: string
}

export function LineRow({ entry, group, onTick, onUntick, onOpen, pending, sync: syncProp, name = entry.title }: LineRowProps) {
  const ticked = group === 'ticked'
  // B9-54: a waiting Tick is the entry's own state; a refused one is the screen's (the row is open again)
  const sync = ticked ? (entry.sync ?? syncProp) : syncProp === 'failed' ? 'failed' : undefined
  const meta: RowMeta = sync === 'failed' ? { text: shopStrings.tickNotSynced } : rowMeta(entry)
  const { value, subValue } = rowValue(entry)
  // round 2: the label is stable ("Tick X") and the state is aria-pressed; the ticked mark is a plain check in a CSS circle.
  // A pending tick is aria-disabled, never disabled: it keeps the focus (A11Y-07) and a second press does nothing.
  const control =
    group === 'not-needed' ? undefined : (
      <button
        type="button"
        className="line-row__tick"
        aria-label={sync === 'pending' ? shopStrings.tickWaiting(name) : shopStrings.tickTitle(name)}
        aria-pressed={ticked}
        aria-busy={pending ? true : undefined}
        aria-disabled={pending ? true : undefined}
        onClick={() => {
          if (pending) return
          if (ticked) onUntick?.(entry)
          else onTick?.(entry)
        }}
      >
        {ticked ? <Icon name="tick" size={24} weight="bold" /> : null}
      </button>
    )
  return (
    <ListRow
      title={entry.title}
      aria-label={name !== entry.title ? name : undefined}
      onActivate={() => onOpen(entry, group)}
      haspopup="dialog"
      data-state={group}
      data-focus-key={entry.key}
      data-meta-wide={sync === 'failed' ? undefined : metaWidth(meta)}
      leading={<Thumb name={entry.title} imageUrl={entry.imageUrl} size={40} />}
      control={control}
      meta={meta.text || undefined}
      metaCompact={meta.compact}
      metaStatus={meta.status}
      metaIcon={meta.icon}
      sync={sync}
      value={value}
      subValue={subValue}
    />
  )
}
