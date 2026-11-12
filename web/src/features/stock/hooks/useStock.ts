import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import type { UnitSystem } from '../../../lib/units'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { stockApi } from '../api'
import { resolveStockStatus, type StockStatus } from '../lib/status'
import type { AddLotInput, IngredientStock, LotPatch, StockLot, StockLotsResponse } from '../types'

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

/** Stock changed (here or on another device): refetch it and the zero-waste streak, which a go-off or Throw out moves. */
function refreshStock(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: [...STOCK_KEY] }),
    client.invalidateQueries({ queryKey: ['today', 'streak'] }),
  ]).then(() => undefined)
}

/** Keep and Throw out move the zero-waste streak, so Today's tile and the board's refetch it too. */
async function refreshSpoiledOutcome(client: QueryClient): Promise<void> {
  await Promise.all([
    refreshStock(client),
    client.invalidateQueries({ queryKey: ['today', 'streak'] }),
    client.invalidateQueries({ queryKey: ['board'] }),
  ])
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
  const status = statusOf(query, query.data !== undefined && query.data.length === 0)
  return { data: query.data, isLoading: query.isLoading, error: query.error, system, status, refetch: query.refetch }
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

/** Pantry: every Stock Lot (all Ingredients) with the household's date. Refetches on `stock` events. */
export function useAllLots(): LotsState {
  useStockLiveUpdates()
  const query = useQuery({ queryKey: [...STOCK_KEY, 'lots', 'all'], queryFn: () => stockApi.lots() })
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
    onSuccess: () => refreshSpoiledOutcome(client),
  })
  const keep = useMutation({
    mutationFn: (lotId: number) => stockApi.keep(lotId),
    onSuccess: () => refreshSpoiledOutcome(client),
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

function lotsState(query: { data: StockLotsResponse | undefined; isLoading: boolean; error: Error | null; refetch: () => Promise<unknown> }): LotsState {
  return {
    data: query.data?.lots,
    today: query.data?.today,
    isLoading: query.isLoading,
    error: query.error,
    status: statusOf(query, query.data !== undefined && query.data.lots.length === 0),
    refetch: query.refetch,
  }
}

/**
 * The screen status of one query. Offline is read when the hook renders; the query re-renders on its own
 * changes, so a dropped connection shows on the next fetch result.
 */
function statusOf(query: { data: unknown; isLoading: boolean; error: Error | null }, isEmpty: boolean): StockStatus {
  return resolveStockStatus({
    isLoading: query.isLoading,
    error: query.error,
    hasData: query.data !== undefined,
    isEmpty,
    offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  })
}

/** Writes: manual add, Set total and Throw out (a spoiled lot). All invalidate ['stock']. */
export function useStockActions(): {
  addLot(input: AddLotInput): Promise<void>
  setTotal(ingredientId: number, total: number): Promise<void>
  throwOut(lotId: number): Promise<void>
  /** Pantry: moves a Lot, or `quantity` of it, to a Storage Place. */
  moveLot(lotId: number, storagePlaceId: number, quantity?: number): Promise<void>
  /** Beta.5: corrects a Lot (quantity, Bought on, Good until). Invalidates ['stock'] and the zero-waste streak. */
  editLot(lotId: number, patch: LotPatch): Promise<void>
  /** Beta.5: deletes a Lot as a correction. Invalidates ['stock'] and the zero-waste streak. */
  deleteLot(lotId: number): Promise<void>
} {
  const client = useQueryClient()
  const moveLot = useMutation({
    mutationFn: ({ lotId, placeId, quantity }: { lotId: number; placeId: number; quantity?: number }) => stockApi.moveLot(lotId, placeId, quantity),
    onSuccess: () => refreshStock(client),
  })
  const addLot = useMutation({
    mutationFn: (input: AddLotInput) => stockApi.addLot(input),
    onSuccess: () => refreshStock(client),
  })
  const throwOut = useMutation({
    mutationFn: (lotId: number) => stockApi.throwOut(lotId),
    onSuccess: () => refreshStock(client),
  })
  const setTotal = useMutation({
    mutationFn: ({ ingredientId, total }: { ingredientId: number; total: number }) => stockApi.setTotal(ingredientId, total),
    onSuccess: () => refreshStock(client),
  })
  const editLot = useMutation({
    mutationFn: ({ lotId, patch }: { lotId: number; patch: LotPatch }) => stockApi.updateLot(lotId, patch),
    onSuccess: () => refreshStock(client),
  })
  const deleteLot = useMutation({
    mutationFn: (lotId: number) => stockApi.deleteLot(lotId),
    onSuccess: () => refreshStock(client),
  })
  return {
    addLot: async (input) => {
      await addLot.mutateAsync(input)
    },
    setTotal: async (ingredientId, total) => {
      await setTotal.mutateAsync({ ingredientId, total })
    },
    throwOut: async (lotId) => {
      await throwOut.mutateAsync(lotId)
    },
    moveLot: async (lotId, placeId, quantity) => {
      await moveLot.mutateAsync({ lotId, placeId, quantity })
    },
    editLot: async (lotId, patch) => {
      await editLot.mutateAsync({ lotId, patch })
    },
    deleteLot: async (lotId) => {
      await deleteLot.mutateAsync(lotId)
    },
  }
}
