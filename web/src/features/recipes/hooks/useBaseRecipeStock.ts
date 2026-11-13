import { useQuery } from '@tanstack/react-query'
import { stockApi } from '../../stock/api'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { baseStockLine } from '../lib/stockLine'

/**
 * BR-D round 4: what the Pantry holds of a Base recipe's Ingredient ("In the Pantry: 300 ml"), read from GET /api/stock by `baseIngredientId`.
 * `line` is null while the Stock has not loaded or cannot be loaded (never a wrong "none"); asks for nothing without an Ingredient.
 */
export function useBaseRecipeStock(baseIngredientId: number | undefined): { line: string | null } {
  const system = useDisplayUnitSystem()
  const query = useQuery({
    queryKey: ['stock', 'totals'],
    queryFn: () => stockApi.totals(),
    enabled: baseIngredientId !== undefined,
  })
  if (baseIngredientId === undefined || !query.data) return { line: null }
  const row = query.data.find((r) => r.ingredientId === baseIngredientId)
  return { line: baseStockLine(row, system) }
}
