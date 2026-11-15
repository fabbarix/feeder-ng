import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { optOutLine, type ExplanationGroup } from '../lib/couldntExclusions'
import { planStrings as s } from '../strings'
import { EaterPills, ExclusionCells, ExclusionRecords } from './CouldntPlanExclusionLists'
import '../plan.css'

export interface CouldntPlanExclusionTileProps {
  group: ExplanationGroup
  expanded: boolean
  onToggle: () => void
  /** The id of the cell to focus (the URL hash), when it is in this group. */
  focusId?: string | null
}

/**
 * One explanation: the cells, who eats it, who opts out, and one row per Exclusion with its links. The cells are behind
 * "Show all N" when there are several; a Tile of one cell always shows its line. Renders only (lib/couldntExclusions).
 */
export function CouldntPlanExclusionTile({ group, expanded, onToggle, focusId = null }: CouldntPlanExclusionTileProps): ReactNode {
  const headingId = useId()
  const listId = useId()
  const ref = useRef<HTMLElement>(null)
  const single = group.items.length <= 1
  const showList = single || expanded

  // The cell the URL hash names takes focus once its list is on screen (the Tile opened for it).
  useEffect(() => {
    if (!focusId || !showList) return
    const line = ref.current?.querySelector<HTMLElement>(`[id="${focusId}"]`)
    if (!line) return
    line.focus()
    line.scrollIntoView?.({ block: 'center' })
  }, [focusId, showList])

  const optOut = optOutLine(group)
  return (
    <Tile as="section" ref={ref} aria-labelledby={headingId} variant="status" status="warn" overline={s.couldntPlanTitle} overlineIcon="exclusion" className="plan-couldnt">
      <h2 id={headingId} className="plan__tile-title">
        {group.summary}
      </h2>
      {single ? null : (
        <div className="plan__row">
          <Button variant="secondary" size="sm" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
            {expanded ? s.couldntExclusions.hideList : s.couldntExclusions.showAll(group.items.length)}
          </Button>
        </div>
      )}
      {showList ? <ExclusionCells id={listId} items={group.items} /> : null}
      <p className="plan__caption">{s.couldntExclusions.whoEatsIt}</p>
      <EaterPills members={group.attendance} />
      {optOut ? <p className="plan__muted">{optOut}</p> : null}
      {group.exclusions === null ? (
        <p className="plan__muted">{s.couldntExclusions.stillWorking}</p>
      ) : (
        <ExclusionRecords records={group.exclusions} more={group.moreExclusions} />
      )}
    </Tile>
  )
}
