import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import type { UnitSystem } from '../../../lib/units'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { stockApi } from '../api'
import type { AddLotInput, IngredientStock, StockLot } from '../types'

export interface QueryState<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
}

const STOCK_KEY = ['stock'] as const

/** Today's date (YYYY-MM-DD) on this device, for go-off wording. */
export function useToday(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function refreshStock(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: [...STOCK_KEY] })
}

/** Refetches Stock when any Stock change is published (topic "stock"). Does nothing where there is no EventSource. */
function useStockLiveUpdates(): void {
  const client = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const off = connection.subscribe('stock', () => void refreshStock(client))
    const offReconnect = connection.onReconnect(() => void refreshStock(client))
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])
}

/**
 * Per-Ingredient totals (unsorted: the screen sorts with sortTotals), plus the
 * User's unit system for display. Refetches on `stock` events.
 */
export function useStockTotals(): QueryState<IngredientStock[]> & { system: UnitSystem } {
  useStockLiveUpdates()
  const system = useDisplayUnitSystem()
  const query = useQuery({ queryKey: [...STOCK_KEY, 'totals'], queryFn: () => stockApi.totals() })
  return { data: query.data, isLoading: query.isLoading, error: query.error, system }
}

/** The lots of one Ingredient (disabled while ingredientId is null). */
export function useStockLots(ingredientId: number | null): QueryState<StockLot[]> {
  const query = useQuery({
    queryKey: [...STOCK_KEY, 'lots', ingredientId],
    queryFn: () => stockApi.lots(ingredientId ?? undefined),
    enabled: ingredientId !== null,
  })
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}

/** Spoiled lots plus the two answers to "Throw out or keep?". Both invalidate ['stock']. */
export function useSpoiledLots(): QueryState<StockLot[]> & {
  throwOut(lotId: number): Promise<void>
  keep(lotId: number): Promise<void>
} {
  const client = useQueryClient()
  const query = useQuery({ queryKey: [...STOCK_KEY, 'spoiled'], queryFn: () => stockApi.spoiled() })
  const throwOut = useMutation({
    mutationFn: (lotId: number) => stockApi.throwOut(lotId),
    onSuccess: () => refreshStock(client),
  })
  const keep = useMutation({
    mutationFn: (lotId: number) => stockApi.keep(lotId),
    onSuccess: () => refreshStock(client),
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    throwOut: async (lotId) => {
      await throwOut.mutateAsync(lotId)
    },
    keep: async (lotId) => {
      await keep.mutateAsync(lotId)
    },
  }
}

/** Writes: manual add and Set total. Both invalidate ['stock']. */
export function useStockActions(): {
  addLot(input: AddLotInput): Promise<void>
  setTotal(ingredientId: number, total: number): Promise<void>
} {
  const client = useQueryClient()
  const addLot = useMutation({
    mutationFn: (input: AddLotInput) => stockApi.addLot(input),
    onSuccess: () => refreshStock(client),
  })
  const setTotal = useMutation({
    mutationFn: ({ ingredientId, total }: { ingredientId: number; total: number }) => stockApi.setTotal(ingredientId, total),
    onSuccess: () => refreshStock(client),
  })
  return {
    addLot: async (input) => {
      await addLot.mutateAsync(input)
    },
    setTotal: async (ingredientId, total) => {
      await setTotal.mutateAsync({ ingredientId, total })
    },
  }
}
