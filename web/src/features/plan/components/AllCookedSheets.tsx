import type { ReactNode } from 'react'
import type { AllCookedFlow } from '../hooks/useAllCookedFlow'
import { MarkAllCookedSheet } from './MarkAllCookedSheet'
import { ShortfallNotice } from './ShortfallNotice'
import { StockCorrectionSheet } from './StockCorrectionSheet'

/**
 * The Mark all Cooked sheet, the Stock shortfall notices and the Stock correction sheet of one AllCookedFlow (Plan and
 * Today; the same outcome as the single Course's CookFlowSheets).
 */
export function AllCookedSheets({ flow }: { flow: AllCookedFlow }): ReactNode {
  const { controller, stock, key, close, warnings, dismissWarning } = flow
  return (
    <>
      {warnings.map((w) => (
        <ShortfallNotice key={w.ingredientId} warning={w} onCorrect={stock.open} onDismiss={(x) => dismissWarning(x.ingredientId)} />
      ))}
      <MarkAllCookedSheet
        open={key !== null}
        onClose={close}
        rows={controller.rows}
        isLoading={controller.isLoading}
        onLeftoverChange={controller.setLeftover}
        onConfirm={() => void flow.confirm()}
        busy={controller.busy}
        error={controller.error}
      />
      <StockCorrectionSheet
        open={stock.correction !== null}
        onClose={stock.close}
        correction={stock.correction}
        onSave={(t) => void stock.save(t)}
        busy={stock.busy}
        error={stock.error}
      />
    </>
  )
}
