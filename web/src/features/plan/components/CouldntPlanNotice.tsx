import type { ReactNode } from 'react'
import { useCauseExpansion } from '../hooks/useCauseExpansion'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { CouldntPlanTile } from './CouldntPlanTile'
import '../plan.css'

export interface CouldntPlanNoticeProps {
  groups: NoticeGroup[]
  onFix: (group: NoticeGroup) => void
}

/** Couldn't plan: one tile per cause. Its wrapper is `display: contents`, so the tiles are items of the grid it sits in. */
export function CouldntPlanNotice({ groups, onFix }: CouldntPlanNoticeProps): ReactNode {
  const expansion = useCauseExpansion()
  if (groups.length === 0) return null
  return (
    <div className="plan-couldnt-notice">
      {groups.map((group) => (
        <CouldntPlanTile key={group.cause} group={group} expanded={expansion.isOpen(group.cause)} onToggle={() => expansion.toggle(group.cause)} onFix={() => onFix(group)} />
      ))}
    </div>
  )
}
