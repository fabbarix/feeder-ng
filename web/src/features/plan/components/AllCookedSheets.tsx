import type { ReactNode } from 'react'
import type { AllCookedFlow } from '../hooks/useAllCookedFlow'
import { MarkAllCookedSheet } from './MarkAllCookedSheet'
import { ShortfallSheets } from './ShortfallSheets'

/**
 * The Mark all Cooked sheet, the Stock shortfall notices and the Stock correction sheet of one AllCookedFlow (Plan and
 * Today; the same outcome as the single Course's CookFlowSheets).
 */
export function AllCookedSheets({ flow }: { flow: AllCookedFlow }): ReactNode {
  const { controller, key, close } = flow
  return (
    <>
      <ShortfallSheets groups={flow.shortfalls} correct={flow.correct} onDismiss={flow.dismissShortfalls} system={flow.system} placement="list" />
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
