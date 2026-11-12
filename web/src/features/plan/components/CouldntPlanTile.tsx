import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Tile } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { toneStyle } from '../lib/couldntGroups'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface CouldntPlanTileProps {
  group: NoticeGroup
  expanded: boolean
  onToggle: () => void
  onFix: () => void
  /** Default 2; `full` takes the whole row (Today, and the 7-column Plan). */
  span?: 2 | 'full'
}

/**
 * One tile per cause of Couldn't plan: overline, a headline that says it once, the affected meals in a line, a hint,
 * "Show all N" (two or more) and one fix action. A section named by its headline, not an alarm.
 */
export function CouldntPlanTile({ group, expanded, onToggle, onFix, span = 2 }: CouldntPlanTileProps): ReactNode {
  const headingId = useId()
  const listId = useId()
  const tile = toneStyle(group.tone).tile
  return (
    <Tile
      as="section"
      aria-labelledby={headingId}
      {...tile}
      span={span}
      overline={s.couldntPlanTitle}
      overlineIcon={group.icon}
      data-cause={group.cause}
      data-couldnt-tone={group.tone}
      className="plan-couldnt"
    >
      <h2 id={headingId} className="plan__tile-title">
        {group.headline}
      </h2>
      <p className="plan-couldnt__summary">{group.summary}</p>
      <p className="plan__muted">{group.canFix ? group.hint : `${group.hint} ${s.couldntAskAdmin}`}</p>
      {group.items.length > 1 ? (
        <div className="plan__row">
          <Button variant="tertiary" size="sm" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
            {expanded ? s.couldntHideList : s.couldntShowAll(group.items.length)}
          </Button>
        </div>
      ) : null}
      {expanded ? (
        <ul id={listId} className="plan__list">
          {group.items.map((item) => (
            <li key={item.key}>{item.to ? <Link to={item.to}>{item.text}</Link> : item.text}</li>
          ))}
        </ul>
      ) : null}
      {group.canFix ? (
        <div className="plan__row">
          <Button variant="secondary" size="sm" onClick={onFix}>
            {group.fix.label}
          </Button>
        </div>
      ) : null}
    </Tile>
  )
}
