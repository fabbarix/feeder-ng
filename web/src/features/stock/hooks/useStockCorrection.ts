// B9-45 (PC-02): the state of the ONE Correct Stock sheet for the Cooked meals' shortfalls. Save writes one Stock total per row the
// User raised above 0 (a Stock-take, PUT /api/stock/ingredients/:id/total), toasts "Stock corrected for N Ingredients" (no icon) and
// settles every row of the sheet, so the screen takes the whole notice away.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { useToast } from '../../../ui'
import { stockApi } from '../api'
import { correctedText, correctionRows, correctionWrites, type CorrectionRow, type ShortfallGroup } from '../lib/shortfall'
import { stockStrings } from '../strings'

export interface StockCorrectionController {
  open: boolean
  /** The rows of the sheet (lib/shortfall correctionRows of the groups). */
  rows: CorrectionRow[]
  show: () => void
  close: () => void
  /** One PUT /api/stock/ingredients/:id/total per row the User raised above 0 (lib/shortfall correctionWrites), then the toast "Stock corrected for N Ingredients"; onSaved gets the id of EVERY row of the sheet. Resolves true when it closed. */
  save: (values: Record<number, number>) => Promise<boolean>
  busy: boolean
  error: string | null
}

export function useStockCorrection(groups: ShortfallGroup[], onSaved: (ingredientIds: number[]) => void, system: UnitSystem = 'metric'): StockCorrectionController {
  const toast = useToast()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rows = useMemo(() => correctionRows(groups, system), [groups, system])

  const show = useCallback(() => {
    setError(null)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])

  const save = useCallback(
    async (values: Record<number, number>) => {
      const writes = correctionWrites(rows, values)
      if (writes.length === 0) {
        setOpen(false)
        return true
      }
      setBusy(true)
      setError(null)
      try {
        for (const write of writes) await stockApi.setTotal(write.ingredientId, write.total)
      } catch {
        setError(stockStrings.shortfall.saveError)
        return false
      } finally {
        setBusy(false)
      }
      void client.invalidateQueries({ queryKey: ['stock'] })
      toast.show(correctedText(writes.length), { status: 'success' })
      onSaved(rows.map((r) => r.ingredientId))
      setOpen(false)
      return true
    },
    [rows, client, toast, onSaved],
  )

  return { open, rows, show, close, save, busy, error }
}

/** What a flow hands out while it has nothing to correct. */
export const INERT_CORRECTION: StockCorrectionController = {
  open: false, rows: [], show: () => {}, close: () => {}, save: async () => false, busy: false, error: null,
}
