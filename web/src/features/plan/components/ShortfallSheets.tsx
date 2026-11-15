// B9-45 (PC-02): a cook flow's ONE Stock-shortfall notice and its ONE Correct Stock sheet, as the Plan, Today and Cook Mode show them.
import type { ReactNode } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { ShortfallNotice } from '../../stock/components/ShortfallNotice'
import { StockCorrectionSheet } from '../../stock/components/StockCorrectionSheet'
import type { StockCorrectionController } from '../../stock/hooks/useStockCorrection'
import { correctionContext, type ShortfallGroup } from '../../stock/lib/shortfall'

export interface ShortfallSheetsProps {
  groups: ShortfallGroup[]
  correct: StockCorrectionController
  onDismiss: () => void
  system?: UnitSystem
  /** `list` on Today and the Plan, `cooked` in Cook Mode's confirmation. */
  placement: 'cooked' | 'list'
}

export function ShortfallSheets({ groups, correct, onDismiss, system = 'metric', placement }: ShortfallSheetsProps): ReactNode {
  return (
    <>
      <ShortfallNotice groups={groups} system={system} placement={placement} onCorrect={correct.show} onDismiss={onDismiss} />
      <StockCorrectionSheet
        open={correct.open}
        onClose={correct.close}
        context={correctionContext(groups)}
        rows={correct.rows}
        system={system}
        onSave={(values) => void correct.save(values)}
        busy={correct.busy}
        error={correct.error}
      />
    </>
  )
}
