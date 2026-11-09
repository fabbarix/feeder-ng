import type { AddLotInput, IngredientStock, StockLot } from '../types'

export interface QueryState<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
}

/** Today's date (YYYY-MM-DD) for go-off wording. */
export function useToday(): string {
  throw new Error('TODO')
}

/** Per-Ingredient totals, sorted with sortTotals; refetches on `stock` events. */
export function useStockTotals(): QueryState<IngredientStock[]> {
  throw new Error('TODO')
}

/** The lots of one Ingredient (disabled while ingredientId is null). */
export function useStockLots(ingredientId: number | null): QueryState<StockLot[]> {
  void ingredientId
  throw new Error('TODO')
}

/** Spoiled lots plus the two answers to "Throw out or keep?". Both invalidate ['stock']. */
export function useSpoiledLots(): QueryState<StockLot[]> & {
  throwOut(lotId: number): Promise<void>
  keep(lotId: number): Promise<void>
} {
  throw new Error('TODO')
}

/** Writes: manual add and Set total. Both invalidate ['stock']. */
export function useStockActions(): {
  addLot(input: AddLotInput): Promise<void>
  setTotal(ingredientId: number, total: number): Promise<void>
} {
  throw new Error('TODO')
}
