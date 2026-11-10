import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import type { UnitSystem } from '../../../lib/units'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { stockApi } from '../api'
import type { StockStatus } from '../lib/status'
import type { AddLotInput, IngredientStock, StockLot, StockLotsResponse } from '../types'

export interface QueryState<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  /**
   * 'loading' | 'error' | 'offline' | 'empty' | 'ready' from resolveStockStatus (lib/status.ts).
   * offline = navigator.onLine === false; held data wins over offline and error; empty = received and no rows.
   */
  status: StockStatus
  /** Refetches this query ("Try again"). */
  refetch: () => Promise<unknown>
}

/** A lots query: the lots plus the household's date from the server (undefined until loaded). */
export interface LotsState extends QueryState<StockLot[]> {
  today: string | undefined
}

const STOCK_KEY = ['stock'] as const

function refreshStock(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: [...STOCK_KEY] })
}

/**
 * Refetches Stock when a `stock` event arrives and after the stream reconnects.
 * Every Stock hook calls it, so they share the one subscription. Closes on unmount.
 * Does nothing where there is no EventSource.
 */
export function useStockLiveUpdates(): void {
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
  // TODO(developer): status via resolveStockStatus, refetch: query.refetch
  return { data: query.data, isLoading: query.isLoading, error: query.error, system, status: 'loading', refetch: query.refetch }
}

/** The lots of one Ingredient (disabled while ingredientId is null). Refetches on `stock` events. */
export function useStockLots(ingredientId: number | null): LotsState {
  useStockLiveUpdates()
  const query = useQuery({
    queryKey: [...STOCK_KEY, 'lots', ingredientId],
    queryFn: () => stockApi.lots(ingredientId ?? undefined),
    enabled: ingredientId !== null,
  })
  return lotsState(query)
}

/** Spoiled lots plus the two answers to "Throw out or keep?". Both invalidate ['stock']; refetches on `stock` events. */
export function useSpoiledLots(): LotsState & {
  throwOut(lotId: number): Promise<void>
  keep(lotId: number): Promise<void>
} {
  useStockLiveUpdates()
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
    ...lotsState(query),
    throwOut: async (lotId) => {
      await throwOut.mutateAsync(lotId)
    },
    keep: async (lotId) => {
      await keep.mutateAsync(lotId)
    },
  }
}

function lotsState(query: { data: StockLotsResponse | undefined; isLoading: boolean; error: Error | null }): LotsState {
  return {
    data: query.data?.lots,
    today: query.data?.today,
    isLoading: query.isLoading,
    error: query.error,
    // TODO(developer): status via resolveStockStatus (empty = data.lots is []), refetch: query.refetch
    status: 'loading',
    refetch: async () => undefined,
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
