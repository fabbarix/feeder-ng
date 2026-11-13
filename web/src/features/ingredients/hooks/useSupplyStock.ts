// H9: the Supplies list's Stock, joined from GET /api/stock (useStockTotals) to the Supplies by id. No new endpoint.
import { useMemo } from 'react'
import { useStockTotals } from '../../stock/hooks/useStock'

export interface SupplyStock {
  /** Ingredient id -> total in Base Units, for each Supply. A Supply missing from the answer has 0. null until Stock has loaded. */
  totals: ReadonlyMap<number, number> | null
  isLoading: boolean
  error: Error | null
}

/** Stock of the Supplies only (rows with kind "supply"); food is left out. */
export function useSupplyStock(): SupplyStock {
  const stock = useStockTotals()
  const totals = useMemo(() => {
    if (stock.data === undefined) return null
    return new Map(stock.data.filter((row) => row.kind === 'supply').map((row) => [row.ingredientId, row.total] as const))
  }, [stock.data])
  return { totals, isLoading: stock.isLoading, error: stock.error }
}
