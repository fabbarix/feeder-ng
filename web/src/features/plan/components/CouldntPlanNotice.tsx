import { useId, type ReactNode } from 'react'
import { Button, Tile, TileHeader } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { planStrings as s } from '../strings'
import { CouldntCauseRow } from './CouldntPlanTile'
import '../plan.css'

/** The TileHeader badge tone, spread (the native-controls check reads a tone attribute on a Tile-named element as the legacy prop). */
const INFO_BADGE = { tone: 'info' } as const

export interface CouldntPlanNoticeProps {
  groups: NoticeGroup[]
  onFix: (group: NoticeGroup) => void
  /** B9-32 (PC-07): opens the sheet of the affected meals; "Show which meals" is left out without it (Today). */
  onShowMeals?: () => void
  /** The grid tracks the tile takes; Today passes `full`. Default one track (the Plan's two-up grid). */
  span?: 1 | 2 | 'full'
}

/**
 * B9-32 (PC-07): Couldn't plan as ONE compact info tile, a section named "Couldn't plan": the TileHeader (B9-44) with "Show which
 * meals" as its action, then one row per cause. The long explanation lives in the sheets.
 */
export function CouldntPlanNotice({ groups, onFix, onShowMeals, span }: CouldntPlanNoticeProps): ReactNode {
  const titleId = useId()
  if (groups.length === 0) return null
  const showMeals = onShowMeals ? (
    <Button variant="secondary" size="sm" onClick={onShowMeals}>
      {s.couldntShowMeals}
    </Button>
  ) : undefined
  return (
    <Tile as="section" variant="status" status="info" span={span} aria-labelledby={titleId} className="plan-couldnt">
      {/* B9-44 (TB-09): the shared tile header: an info badge, the title that names the section, a count of the causes, Show which meals. */}
      <TileHeader
        icon="info"
        {...INFO_BADGE}
        title={s.couldntPlanTitle}
        titleId={titleId}
        count={groups.length}
        countLabel={s.couldntCauseCount(groups.length)}
        action={showMeals}
      />
      {groups.map((group) => (
        <CouldntCauseRow key={group.cause} group={group} onFix={() => onFix(group)} />
      ))}
    </Tile>
  )
}
