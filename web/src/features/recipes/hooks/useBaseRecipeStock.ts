import { useQuery } from '@tanstack/react-query'
import { stockApi } from '../../stock/api'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { baseStockLine } from '../lib/stockLine'

/**
 * BR-D round 4: what the Pantry holds of a Base recipe's Ingredient ("In the Pantry: 300 ml"), read from GET /api/stock by `baseIngredientId`.
 * `line` is null while the Stock has not loaded or cannot be loaded (never a wrong "none"); asks for nothing without an Ingredient.
 * BR-D round 5: `href` is the Ingredient's page when the Pantry holds some of it, else null ("none" is plain text).
 */
export function useBaseRecipeStock(baseIngredientId: number | undefined): { line: string | null; href: string | null } {
  const system = useDisplayUnitSystem()
  const query = useQuery({
    queryKey: ['stock', 'totals'],
    queryFn: () => stockApi.totals(),
    enabled: baseIngredientId !== undefined,
  })
  if (baseIngredientId === undefined || !query.data) return { line: null, href: null }
  const row = query.data.find((r) => r.ingredientId === baseIngredientId)
  const inPantry = row !== undefined && row.total > 0
  return { line: baseStockLine(row, system), href: inPantry ? `/ingredients/${baseIngredientId}` : null }
}
