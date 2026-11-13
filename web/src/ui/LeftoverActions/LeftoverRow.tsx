// A Leftover on Today, the Plan or the Pantry: a row with its row Menu. Presentational: no API calls.
import { actionLabel, leftoverRow, menuActions } from '../../lib/leftovers/rows'
import { leftoverStrings } from '../../lib/leftovers/copy'
import type { Leftover, LeftoverActionKind } from '../../lib/leftovers'
import { ListRow } from '../ListRow'
import { Menu, type MenuEntry } from '../Menu'
import './LeftoverActions.css'

export interface LeftoverRowProps {
  leftover: Leftover
  today: string
  /** A menu entry was chosen: the parent opens the matching LeftoverSheet. */
  onAction: (kind: LeftoverActionKind, leftover: Leftover) => void
}

export function LeftoverRow({ leftover, today, onAction }: LeftoverRowProps) {
  const row = leftoverRow(leftover, today)
  const entries: MenuEntry[] = menuActions(leftover, today).map((kind) => ({
    id: kind,
    label: actionLabel(kind),
    tone: kind === 'threw-out' ? 'danger' : undefined,
    onSelect: () => onAction(kind, leftover),
  }))
  const place = leftover.frozen ? (leftover.storagePlaceName ?? leftoverStrings.notSorted) : null
  return (
    <ListRow
      title={row.recipeName}
      meta={row.text}
      metaStatus={row.tone === 'info' ? undefined : row.tone}
      icon={row.icon}
      trailing={entries.length > 0 ? <Menu label={`Actions for ${leftover.recipeName}`} items={entries} /> : undefined}
    >
      {place ? <span className="leftover-row__place">{place}</span> : null}
    </ListRow>
  )
}
