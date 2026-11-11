import type { ReactNode } from 'react'
import { useCauseExpansion } from '../hooks/useCauseExpansion'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { CouldntPlanTile } from './CouldntPlanTile'
import '../plan.css'

export interface CouldntPlanNoticeProps {
  groups: NoticeGroup[]
  onFix: (group: NoticeGroup) => void
  /** Columns each tile takes: 2 (default, two causes side by side on 4 columns) or the full row. */
  span?: 2 | 'full'
}

/** Couldn't plan: one tile per cause. Its wrapper is `display: contents`, so the tiles are items of the grid it sits in. */
export function CouldntPlanNotice({ groups, onFix, span = 2 }: CouldntPlanNoticeProps): ReactNode {
  const expansion = useCauseExpansion()
  if (groups.length === 0) return null
  return (
    <div className="plan-couldnt-notice">
      {groups.map((group) => (
        <CouldntPlanTile key={group.cause} group={group} expanded={expansion.isOpen(group.cause)} onToggle={() => expansion.toggle(group.cause)} onFix={() => onFix(group)} span={span} />
      ))}
    </div>
  )
}
