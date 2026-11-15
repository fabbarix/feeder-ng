// B9-40 (PC-03, SHORT-01): Cook Mode's timers as the screen places them: the strip (in the sticky nav) or the rail (beside the Step), and
// the two sheets. Composition only; hooks/useCookTimerPanel holds the state.
import type { ReactNode } from 'react'
import type { CookTimerPanel } from '../hooks/useCookTimerPanel'
import type { TimerItem } from '../hooks/useTimers'
import { CookTimerRail } from './CookTimerRail'
import { CookTimerSheet } from './CookTimerSheet'
import { CookTimersSheet } from './CookTimersSheet'
import { CookTimerStrip } from './CookTimerStrip'
import { timerNames } from '../lib/timers'

export interface CookTimersProps {
  panel: CookTimerPanel
  scope: string
  items: TimerItem[]
  holdingIds: number[]
  belongs?: (timerScope: string | null) => boolean
  /** Rail only: Get ready below the timers (B9-45 passes it). */
  children?: ReactNode
}

/** The strip of pills below 64 em (`placement="strip"`), nothing from 64 em; for the rail use `placement="rail"`. */
export function CookTimers({ panel, scope, items, holdingIds, belongs, placement, children }: CookTimersProps & { placement: 'strip' | 'rail' }): ReactNode {
  const { actions } = panel
  if (placement === 'strip') {
    if (panel.rail) return null
    return (
      <CookTimerStrip
        scope={scope}
        items={items}
        belongs={belongs}
        holdingIds={holdingIds}
        maxPills={panel.maxPills}
        onPause={(id) => void actions.pause(id)}
        onResume={(id) => void actions.resume(id)}
        onOpenTimer={panel.openTimer}
        onShowAll={panel.showAll}
      />
    )
  }
  if (!panel.rail) return null
  return (
    <CookTimerRail
      scope={scope}
      items={items}
      belongs={belongs}
      holdingIds={holdingIds}
      onPause={(id) => void actions.pause(id)}
      onResume={(id) => void actions.resume(id)}
      onOpenTimer={panel.openTimer}
    >
      {children}
    </CookTimerRail>
  )
}

/** The timer's own sheet and the sheet of every timer. */
export function CookTimerSheets({ panel, scope, items, holdingIds, belongs }: CookTimersProps): ReactNode {
  const { actions } = panel
  return (
    <>
      <CookTimerSheet
        item={panel.sheetItem}
        scope={scope}
        holdsNext={panel.sheetHoldsNext}
        name={panel.sheetItem ? timerNames(items.map((i) => i.timer)).get(panel.sheetItem.timer.id) : undefined}
        onClose={panel.closeTimer}
        onAddMinute={(id) => void actions.addMinute(id)}
        onCancel={(id) => void actions.cancel(id)}
        onDismiss={(id) => void actions.dismiss(id)}
      />
      <CookTimersSheet open={panel.allOpen} scope={scope} items={items} holdingIds={holdingIds} belongs={belongs} onClose={panel.closeAll} onOpenTimer={panel.openFromAll} />
    </>
  )
}
