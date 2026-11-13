import { useEffect, useMemo, useState } from 'react'
import { baseRecipesApi } from './api'
import { baseRecipeLinkStrings } from './strings'
import { pickerRows } from './pickerRows'
import type { PickerBaseRecipe, PickerPlannable, PickerRows } from './types'

export interface UseBaseRecipePicker {
  query: string
  setQuery: (q: string) => void
  /** lib/baseRecipes/pickerRows of what was fetched and the query. */
  rows: PickerRows
  isLoading: boolean
  /** Words for a failed load, or null. */
  error: string | null
}

interface Loaded {
  baseRecipes: PickerBaseRecipe[]
  plannable: PickerPlannable[]
}

/**
 * Data for the BaseRecipePicker. Fetches `GET /api/recipes?kind=base&for={recipeId}` (round 4: the server marks each Base recipe `wouldCycle` for the Recipe
 * being edited, so no client walk is needed; a new Recipe asks without `for`) and `GET /api/recipes` (the plannable Recipes). The Recipe being edited is left
 * out (selfId); a Base recipe that would make a cycle is listed disabled. Logic in pickerRows; this only fetches and holds the query.
 */
export function useBaseRecipePicker(opts: { recipeId?: number; lineName: string }): UseBaseRecipePicker {
  const { recipeId, lineName } = opts
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Loaded | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [baseRecipes, plannable] = await Promise.all([baseRecipesApi.pickerBaseRecipes(recipeId), baseRecipesApi.pickerPlannable()])
        if (cancelled) return
        setData({ baseRecipes, plannable })
      } catch {
        if (cancelled) return
        setError(baseRecipeLinkStrings.couldNotLoadBases)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recipeId])

  const rows = useMemo<PickerRows>(
    () =>
      pickerRows({
        query,
        lineName,
        baseRecipes: data?.baseRecipes ?? [],
        plannable: data?.plannable ?? [],
        selfId: recipeId,
      }),
    [query, lineName, data, recipeId],
  )

  return { query, setQuery, rows, isLoading, error }
}
