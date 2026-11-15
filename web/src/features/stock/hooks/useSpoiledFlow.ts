// B9-29 (SAFE-09, SSP-17): "Throw out or keep?" as the Pantry answers it. Throw out acts at once and toasts "500 g Flour thrown out"
// with Undo; Keep acts at once (good until today) and toasts "Flour kept", "Good until today", with Change (the date sheet) and Undo
// (the old go-off date back). A failed change shows the error toast and no Undo. React hook: the words and the requests come from
// lib and the Stock hooks.
import { useCallback, useState } from 'react'
import { useToast, useUndoToast } from '../../../ui'
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { capitalise } from '../lib/display'
import { keepDayLabel } from '../lib/keepDates'
import { stockStrings as strings } from '../strings'
import type { StockLot, WasteRecord } from '../types'

export interface SpoiledFlowInput {
  system: UnitSystem
  /** The household's date (YYYY-MM-DD). */
  today: string
  keep: (lotId: number, goodUntil?: string) => Promise<StockLot>
  undoKeep: (lotId: number, goesOff: string | null) => Promise<unknown>
}

export interface ThrowOutCalls {
  throwOut: (lotId: number) => Promise<WasteRecord>
  undoThrowOut: (wasteId: number) => Promise<unknown>
}

export interface SpoiledFlow {
  /** Throws the Lot out through `calls` (the spoiled tile's, or the Ingredient sheet's), then offers Undo. */
  throwOut: (lot: StockLot, calls: ThrowOutCalls) => Promise<void>
  /** Keeps the Lot good until today, then offers Change and Undo. */
  keep: (lot: StockLot) => Promise<void>
  /** The Lot whose "good until?" sheet is open (Change), or null. */
  changing: StockLot | null
  /** Keeps the Lot being changed until `date`, and closes the sheet. */
  keepUntil: (date: string) => Promise<void>
  closeChange: () => void
}

export function useSpoiledFlow({ system, today, keep, undoKeep }: SpoiledFlowInput): SpoiledFlow {
  const toast = useToast()
  const undoToast = useUndoToast()
  const [changing, setChanging] = useState<StockLot | null>(null)
  const failed = useCallback(() => toast.show(strings.actionFailed, { status: 'error' }), [toast])

  const throwOut = useCallback(
    async (lot: StockLot, calls: ThrowOutCalls) => {
      let record: WasteRecord
      try {
        record = await calls.throwOut(lot.id)
      } catch {
        failed()
        return
      }
      undoToast.show({
        headline: strings.thrownOut(formatQuantity(lot.quantity, lot.baseUnit, system), capitalise(lot.ingredientName)),
        undo: () => calls.undoThrowOut(record.id),
      })
    },
    [failed, system, undoToast],
  )

  const keepLot = useCallback(
    async (lot: StockLot) => {
      try {
        await keep(lot.id)
      } catch {
        failed()
        return
      }
      const name = capitalise(lot.ingredientName)
      undoToast.show({
        headline: strings.keepDate.kept(name),
        subline: strings.keepDate.goodUntilToday,
        actions: [{ label: strings.keepDate.change, onClick: () => setChanging(lot) }],
        undo: () => undoKeep(lot.id, lot.goesOff),
      })
    },
    [failed, keep, undoKeep, undoToast],
  )

  const keepUntil = useCallback(
    async (date: string) => {
      const lot = changing
      if (!lot) return
      try {
        await keep(lot.id, date)
      } catch {
        failed()
        return
      }
      setChanging(null)
      undoToast.show({
        headline: strings.keepDate.kept(capitalise(lot.ingredientName)),
        subline: date === today ? strings.keepDate.goodUntilToday : strings.keepDate.goodUntil(keepDayLabel(date)),
        undo: () => undoKeep(lot.id, lot.goesOff),
      })
    },
    [changing, failed, keep, today, undoKeep, undoToast],
  )

  return { throwOut, keep: keepLot, changing, keepUntil, closeChange: useCallback(() => setChanging(null), []) }
}
