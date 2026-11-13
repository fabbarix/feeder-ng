import { useEffect, useMemo, useState } from 'react'
import { baseRecipesApi } from './api'
import { baseRecipeLinkStrings } from './strings'
import { pickerRows } from './pickerRows'
import type { PickerBaseRecipe, PickerPlannable, PickerRows } from './types'

export interface UseBaseRecipePicker {
  query: string
  setQuery: (q: string) => void
  /** lib/baseRecipes/pickerRows of what was fetched, the query and the blocked set. */
  rows: PickerRows
  isLoading: boolean
  /** Words for a failed load, or null. */
  error: string | null
}

interface Loaded {
  baseRecipes: PickerBaseRecipe[]
  plannable: PickerPlannable[]
  blocked: Record<number, string>
}

/** Every Recipe that calls for `recipeId`, directly or through other Base recipes, with the reason it is blocked. */
async function blockedBy(recipeId: number): Promise<Record<number, string>> {
  const blocked: Record<number, string> = {}
  const seen = new Set<number>([recipeId])
  const queue = [recipeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    let callers: Array<{ id: number; name: string }> = []
    try {
      callers = await baseRecipesApi.usedBy(current)
    } catch {
      continue
    }
    for (const caller of callers) {
      if (seen.has(caller.id)) continue
      seen.add(caller.id)
      blocked[caller.id] = `${caller.name} already calls for this Recipe`
      queue.push(caller.id)
    }
  }
  return blocked
}

/**
 * Data for the BaseRecipePicker. Fetches `GET /api/recipes?kind=base` and `GET /api/recipes` (the plannable Recipes). With `recipeId`, the Recipe being edited:
 * it is left out (selfId) and every Recipe that calls for it, directly or through other Base recipes (`GET /api/recipes/{id}` -> `usedBy`, followed down),
 * is blocked with "<name> already calls for this Recipe". A new Recipe (no recipeId) blocks nothing. Logic in pickerRows; this only fetches and holds the query.
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
        const [baseRecipes, plannable, blocked] = await Promise.all([
          baseRecipesApi.pickerBaseRecipes(),
          baseRecipesApi.pickerPlannable(),
          recipeId === undefined ? Promise.resolve({} as Record<number, string>) : blockedBy(recipeId),
        ])
        if (cancelled) return
        setData({ baseRecipes, plannable, blocked })
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
        blocked: data?.blocked,
      }),
    [query, lineName, data, recipeId],
  )

  return { query, setQuery, rows, isLoading, error }
}
