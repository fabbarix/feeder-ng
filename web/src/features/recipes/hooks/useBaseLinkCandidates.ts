import { useQuery } from '@tanstack/react-query'
import { http } from '../../../lib/http'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'

/**
 * BR-D (design §3.8): the plain lines of an Ingredient with the Base recipe's name, on other Recipes (`GET /api/recipes/{id}/link-candidates`), for the
 * detail's "Recipes with an Ingredient named béchamel (N)" row. Only for a Base recipe (`enabled`). `count` = the distinct Recipes the lines are on.
 */
export function useBaseLinkCandidates(baseRecipeId: number, enabled: boolean): { count: number; ingredientName: string; refetch: () => void } {
  const query = useQuery({
    queryKey: ['recipes', 'link-candidates', baseRecipeId],
    queryFn: () => baseRecipesApi.linkCandidates(baseRecipeId),
    enabled: enabled && Number.isFinite(baseRecipeId),
  })
  const lines = query.data ?? []
  return {
    count: new Set(lines.map((l) => l.recipeId)).size,
    ingredientName: lines[0]?.ingredientName ?? '',
    refetch: () => void query.refetch(),
  }
}

/**
 * BR-D (design §3.8): the Base Unit of a Base recipe's Ingredient, for the bulk link list's reasons ("cup cannot be converted to ml yet"). Known from the
 * Ingredient list when it has loaded; else read from the Ingredient itself (`GET /api/ingredients/{id}`). undefined until known: never a guessed unit.
 */
export function useBaseIngredientUnit(ingredientId: number, known: string | undefined): string | undefined {
  const query = useQuery({
    queryKey: ['ingredients', ingredientId],
    queryFn: () => http.get<{ baseUnit: string }>(`/api/ingredients/${ingredientId}`),
    enabled: known === undefined && Number.isFinite(ingredientId),
  })
  return known ?? query.data?.baseUnit
}
