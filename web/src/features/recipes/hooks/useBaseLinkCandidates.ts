import { useQuery } from '@tanstack/react-query'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'

/**
 * BR-D (design §3.8): the plain lines of an Ingredient with the Base recipe's name, on other Recipes (`GET /api/recipes/{id}/link-candidates`), for the
 * detail's "Recipes with an Ingredient named béchamel (N)" row. Only for a Base recipe (`enabled`). `count` = the distinct Recipes the lines are on;
 * `baseUnit` is the Base Unit the answer carries (round 4), undefined until it has arrived: never a guessed unit.
 */
export function useBaseLinkCandidates(baseRecipeId: number, enabled: boolean): { count: number; ingredientName: string; baseUnit: string | undefined; refetch: () => void } {
  const query = useQuery({
    queryKey: ['recipes', 'link-candidates', baseRecipeId],
    queryFn: () => baseRecipesApi.linkCandidates(baseRecipeId),
    enabled: enabled && Number.isFinite(baseRecipeId),
  })
  const lines = query.data?.lines ?? []
  return {
    count: new Set(lines.map((l) => l.recipeId)).size,
    ingredientName: lines[0]?.ingredientName ?? '',
    baseUnit: query.data?.baseUnit,
    refetch: () => void query.refetch(),
  }
}
