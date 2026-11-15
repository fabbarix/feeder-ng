import type { ReactNode } from 'react'
import { Button, Icon, Tile } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { planStrings as s } from '../strings'
import { CouldntCauseRow } from './CouldntPlanTile'
import '../plan.css'

export interface CouldntPlanNoticeProps {
  groups: NoticeGroup[]
  onFix: (group: NoticeGroup) => void
  /** B9-32 (PC-07): opens the sheet of the affected meals; "Show which meals" is left out without it (Today). */
  onShowMeals?: () => void
}

/**
 * B9-32 (PC-07): Couldn't plan as ONE compact info tile, a section named "Couldn't plan": the overline and "Show which
 * meals" in its header, then one row per cause. The long explanation lives in the sheets.
 */
export function CouldntPlanNotice({ groups, onFix, onShowMeals }: CouldntPlanNoticeProps): ReactNode {
  if (groups.length === 0) return null
  return (
    <Tile as="section" variant="status" status="info" aria-label={s.couldntPlanTitle} className="plan-couldnt">
      <div className="couldnt-head">
        <p className="tile__overline">
          <Icon name="info" size={16} />
          {s.couldntPlanTitle}
        </p>
        {onShowMeals ? (
          <Button variant="secondary" size="sm" onClick={onShowMeals}>
            {s.couldntShowMeals}
          </Button>
        ) : null}
      </div>
      {groups.map((group) => (
        <CouldntCauseRow key={group.cause} group={group} onFix={() => onFix(group)} />
      ))}
    </Tile>
  )
}
