import { useState } from 'react'
import { correctionFor, type Correction } from '../lib/cook'
import type { StockWarning } from '../types'
import { useStockCorrection } from './useStockCorrection'

export interface StockSheetController {
  correction: Correction | null
  open: (warning: StockWarning) => void
  close: () => void
  save: (total: number) => Promise<void>
  busy: boolean
  error: string | null
}

/** The "Correct Stock" sheet: which shortfall is being corrected, and saving its total. onDone fires after a save. */
export function useStockSheet(onDone: (ingredientId: number) => void): StockSheetController {
  const [correction, setCorrection] = useState<Correction | null>(null)
  const stock = useStockCorrection()
  return {
    correction,
    open: (w) => setCorrection(correctionFor(w)),
    close: () => setCorrection(null),
    save: async (total) => {
      if (!correction) return
      if (await stock.correct(correction.ingredientId, total)) {
        onDone(correction.ingredientId)
        setCorrection(null)
      }
    },
    busy: stock.busy,
    error: stock.error,
  }
}
