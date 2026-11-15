// A Leftover on Today, the Plan or the Pantry: a row with its row Menu. Presentational: no API calls.
import { actionLabel, leftoverRow, menuActions, rowActionName } from '../../lib/leftovers/rows'
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
  /** Adds the Storage Place of a frozen Leftover to its meta line; off where the group heading already names it. Default on. */
  showPlace?: boolean
  /** B9-45 (PC-13): a second meta line, "1.25 for Mon Dinner · 1.25 spare: have it or freeze it" (lib/leftovers spareHint). */
  hint?: string
  /**
   * B9-44 (TB-11): pressing anywhere on the row opens the Leftover's actions (Today's tile): the row is one target named with its facts and
   * what it offers, and it has no row Menu.
   */
  onPress?: (leftover: Leftover) => void
}

export function LeftoverRow({ leftover, today, onAction, showPlace = true, hint, onPress }: LeftoverRowProps) {
  const row = leftoverRow(leftover, today)
  const entries: MenuEntry[] = menuActions(leftover, today).map((kind) => ({
    id: kind,
    label: actionLabel(kind),
    tone: kind === 'threw-out' ? 'danger' : undefined,
    onSelect: () => onAction(kind, leftover),
  }))
  const place = showPlace && leftover.frozen ? (leftover.storagePlaceName ?? leftoverStrings.notSorted) : null
  const meta = place ? `${row.text} · ${place}` : row.text
  const metaStatus = row.tone === 'info' ? undefined : row.tone
  const hintLine = hint ? <span className="list-row__meta leftover-row__hint">{hint}</span> : null
  if (onPress) {
    return (
      <ListRow
        title={row.recipeName}
        aria-label={rowActionName(leftover, today)}
        meta={meta}
        metaStatus={metaStatus}
        icon={row.icon}
        haspopup="dialog"
        onActivate={() => onPress(leftover)}
      >
        {hintLine}
      </ListRow>
    )
  }
  return (
    <ListRow
      title={row.recipeName}
      meta={meta}
      metaStatus={metaStatus}
      icon={row.icon}
      trailing={entries.length > 0 ? <Menu label={`Actions for ${leftover.recipeName}`} title={leftover.recipeName} items={entries} /> : undefined}
    >
      {hintLine}
    </ListRow>
  )
}
