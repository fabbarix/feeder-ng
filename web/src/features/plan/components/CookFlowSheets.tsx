import type { ReactNode } from 'react'
import type { CookFlow } from '../hooks/useCookFlow'
import { MarkCookedSheet } from './MarkCookedSheet'
import { ShortfallNotice } from './ShortfallNotice'
import { StockCorrectionSheet } from './StockCorrectionSheet'

/** The Mark as Cooked sheet, the Stock shortfall notices and the Stock correction sheet of one CookFlow (shared by Plan and Today). */
export function CookFlowSheets({ flow }: { flow: CookFlow }): ReactNode {
  const { cook, stock, cookKey, close, warnings, dismissWarning } = flow
  return (
    <>
      {warnings.map((w) => (
        <ShortfallNotice key={w.ingredientId} warning={w} onCorrect={stock.open} onDismiss={(x) => dismissWarning(x.ingredientId)} />
      ))}
      <MarkCookedSheet
        open={cookKey !== null}
        onClose={close}
        preview={cook.preview}
        isLoading={cook.isLoading}
        leftover={cook.leftover}
        onLeftoverChange={cook.setLeftover}
        onConfirm={() => void flow.confirm()}
        onNotCooked={() => void flow.skip()}
        busy={cook.busy}
        error={cook.error}
        courseId={cook.courseId}
        usedFrom={cook.usedFrom}
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
