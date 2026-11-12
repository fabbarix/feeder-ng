import type { ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { formatLeadTime } from '../lib/advance'
import type { AdvanceGroup } from '../lib/timeline'
import { cookStrings } from '../strings'

export interface TimelineAdvanceTileProps {
  groups: AdvanceGroup[]
  /** The Advance Step's own scope and Recipe Step index. */
  onMarkDone: (scope: string, step: number) => void
}

/**
 * The Advance Steps of every Course above the timeline, grouped by Course (a named group has its Course name as a
 * sub-heading): done ones as "Done: <text>", pending ones with a "Done" button. Nothing when nothing is pending.
 */
export function TimelineAdvanceTile({ groups, onMarkDone }: TimelineAdvanceTileProps): ReactNode {
  const pending = groups.some((g) => g.items.some((i) => !i.done))
  if (!pending) return null
  return (
    <Tile as="section" variant="status" status="spoil" span="full" className="cook-advance">
      <h2 className="cook-advance__heading">{cookStrings.advanceHeading}</h2>
      {groups.map((group) => {
        const list = (
          <ul className="cook-advance__list">
            {group.items.map((item) =>
              item.done ? (
                <li key={`${item.scope}/${item.step}`} className="cook-advance__done">
                  {cookStrings.advanceDone(item.text)}
                </li>
              ) : (
                <li key={`${item.scope}/${item.step}`} className="cook-advance__row">
                  <p>{cookStrings.advanceAhead(item.text, formatLeadTime(item.leadTimeMinutes))}</p>
                  <Button variant="secondary" size="sm" onClick={() => onMarkDone(item.scope, item.step)}>
                    {cookStrings.markAdvanceDoneShort}
                  </Button>
                </li>
              ),
            )}
          </ul>
        )
        return group.named ? (
          <section key={group.courseId} role="group" aria-label={group.courseName}>
            <h3 className="cook-advance__course">{group.courseName}</h3>
            {list}
          </section>
        ) : (
          <div key={group.courseId}>{list}</div>
        )
      })}
    </Tile>
  )
}
