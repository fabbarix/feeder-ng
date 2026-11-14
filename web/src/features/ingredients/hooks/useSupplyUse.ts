// H9 (household-items.md section 4.11): the quick Use of a Supply: one tap for a piece, a "how much" sheet for g and ml, the
// toast with Undo, the refetch of Stock and the offline refusal. The rules are in lib/supplyUse; the calls in supplyUseApi.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { useToast } from '../../../ui'
import { productsApi } from '../../products/api'
import { canUse, usedAmount, usesInOneTap } from '../lib/supplyUse'
import { supplyUseApi } from '../supplyUseApi'
import { strings } from '../strings'
import type { Ingredient, SupplyUseResult } from '../types'
import { useDisplayUnitSystem } from './useDisplayUnitSystem'

const S = strings.supplyUse

/** The "how much" sheet of a g or ml Supply. packSize is the Product last bought's pack size (null: none known yet or none). */
export interface SupplySheetState {
  supply: Ingredient
  stock: number
  packSize: number | null
  packLoading: boolean
}

/** Stock is online only: the stock module does not queue offline (household-items.md section 4.11). */
const online = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

export function useSupplyUse() {
  const client = useQueryClient()
  const toast = useToast()
  const system = useDisplayUnitSystem()
  const [sheet, setSheet] = useState<SupplySheetState | null>(null)
  // How many requests are in flight per Supply: two quick Uses on different rows (or a Use and its Undo) never clear each other.
  const [inFlight, setInFlight] = useState<ReadonlyMap<number, number>>(new Map())
  const busyIds = useMemo<ReadonlySet<number>>(() => new Set(inFlight.keys()), [inFlight])
  const startBusy = (id: number) => setInFlight((m) => new Map(m).set(id, (m.get(id) ?? 0) + 1))
  const endBusy = (id: number) =>
    setInFlight((m) => {
      const next = new Map(m)
      const n = (next.get(id) ?? 0) - 1
      if (n > 0) next.set(id, n)
      else next.delete(id)
      return next
    })

  const refetchStock = () => {
    void client.invalidateQueries({ queryKey: ['stock'] })
  }

  /** Undo puts back exactly what the Use took. The action runs once: the toast then shows its answer without the action. */
  const putBack = (result: SupplyUseResult) => {
    let pressed = false
    return async () => {
      if (pressed) return
      pressed = true
      if (!online()) {
        toast.show(S.needsConnection, { status: 'error' })
        return
      }
      startBusy(result.ingredientId)
      try {
        const back = await supplyUseApi.undo(result.ingredientId, result.taken)
        toast.show(S.putBack(usedAmount(back.name, back.quantity, back.baseUnit, system)), { status: 'success' })
      } catch {
        toast.show(S.undoFailed, { status: 'error' })
      } finally {
        endBusy(result.ingredientId)
        refetchStock()
      }
    }
  }

  const send = async (supply: Ingredient, quantity: number) => {
    if (!online()) {
      toast.show(S.needsConnection, { status: 'error' })
      return
    }
    startBusy(supply.id)
    try {
      const result = await supplyUseApi.use(supply.id, quantity)
      toast.show(S.used(usedAmount(supply.name, result.quantity, supply.baseUnit, system)), { actionLabel: S.undo, onAction: putBack(result) })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      toast.show(code === 'use_exceeds_stock' ? S.lessInStock : S.failed, { status: 'error' })
    } finally {
      endBusy(supply.id)
      refetchStock()
    }
  }

  /** The Use button of a row: a piece is used at once; g and ml open the sheet (nothing is sent until its Use). */
  const request = (supply: Ingredient, stock: number) => {
    if (!canUse(stock)) return
    if (!online()) {
      toast.show(S.needsConnection, { status: 'error' })
      return
    }
    if (usesInOneTap(supply.baseUnit)) {
      void send(supply, 1)
      return
    }
    setSheet({ supply, stock, packSize: null, packLoading: true })
    productsApi
      .lastBought(supply.id)
      .then((product) => setSheet((cur) => (cur?.supply.id === supply.id ? { ...cur, packSize: product?.packSize ?? null, packLoading: false } : cur)))
      .catch(() => setSheet((cur) => (cur?.supply.id === supply.id ? { ...cur, packLoading: false } : cur)))
  }

  /** The sheet's Use or Use all: closes the sheet and sends the amount. */
  const confirm = (quantity: number) => {
    if (!sheet) return
    const { supply } = sheet
    setSheet(null)
    void send(supply, quantity)
  }

  const closeSheet = () => setSheet(null)

  return { request, sheet, confirm, closeSheet, busyIds }
}
