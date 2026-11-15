import type { ReactNode } from 'react'
import type { AllCookedFlow } from '../hooks/useAllCookedFlow'
import { MarkAllCookedSheet } from './MarkAllCookedSheet'
import { ShortfallSheets } from './ShortfallSheets'

/**
 * The Mark all Cooked sheet, the Stock shortfall notices and the Stock correction sheet of one AllCookedFlow (Plan and
 * Today; the same outcome as the single Course's CookFlowSheets).
 */
export function AllCookedSheets({ flow, notice = true }: { flow: AllCookedFlow; /** B9-44: false when the screen shows the flows' ONE shortfall notice itself (Today). */ notice?: boolean }): ReactNode {
  const { controller, key, close } = flow
  return (
    <>
      {notice ? <ShortfallSheets groups={flow.shortfalls} correct={flow.correct} onDismiss={flow.dismissShortfalls} system={flow.system} placement="list" /> : null}
      <MarkAllCookedSheet
        open={key !== null}
        onClose={close}
        rows={controller.rows}
        isLoading={controller.isLoading}
        onLeftoverChange={controller.setLeftover}
        onConfirm={() => void flow.confirm()}
        busy={controller.busy}
        error={controller.error}
        usedFrom={controller.usedFrom}
      />
    </>
  )
}
