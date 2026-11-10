import { useId, type ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { slotLine, toneStyle } from '../lib/couldntGroups'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface CouldntPlanTileProps {
  group: NoticeGroup
  expanded: boolean
  onToggle: () => void
  onFix: () => void
}

/**
 * One tile per cause of Couldn't plan: overline, a headline that says it once, the affected meals in a line, a hint,
 * "Show all N meals" (two or more) and one fix action. A section named by its headline, not an alarm.
 */
export function CouldntPlanTile({ group, expanded, onToggle, onFix }: CouldntPlanTileProps): ReactNode {
  const headingId = useId()
  const listId = useId()
  const tile = toneStyle(group.tone).tile
  return (
    <Tile
      as="section"
      aria-labelledby={headingId}
      {...tile}
      span={2}
      overline={s.couldntPlanTitle}
      overlineIcon={group.icon}
      data-cause={group.cause}
      data-tone={group.tone}
      className="plan-couldnt"
    >
      <h2 id={headingId} className="plan__tile-title">
        {group.headline}
      </h2>
      <p className="plan-couldnt__summary">{group.summary}</p>
      <p className="plan__muted">{group.hint}</p>
      {expanded ? (
        <ul id={listId} className="plan__list">
          {group.slots.map((slot) => (
            <li key={`${slot.date}/${slot.mealSlotId}`}>{slotLine(slot)}</li>
          ))}
        </ul>
      ) : null}
      <div className="plan__row">
        {group.count > 1 ? (
          <Button variant="tertiary" size="sm" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
            {expanded ? s.couldntHideList : s.couldntShowAll(group.count)}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onFix}>
          {group.fix.label}
        </Button>
      </div>
    </Tile>
  )
}
