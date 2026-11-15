// B9-45 (PC-05, decision PC 6): the data of Cook Mode's "Get ready" list. Reads each Recipe (GET /api/recipes/:id), the Stock Lots
// (GET /api/stock/lots) and the Storage Places (GET /api/storage-places), and builds the list through lib/ingredients.
import { useQueries, useQuery } from '@tanstack/react-query'
import { recipesApi } from '../../recipes/api'
import { usePreferences } from '../../settings/hooks/usePreferences'
import { stockApi } from '../../stock/api'
import { readyMeta, readySections, type ReadySection, type ReadySource } from '../lib/ingredients'

export interface GetReadySource {
  courseId?: number
  courseName?: string
  recipeId: number
  recipeName: string
  batches: number
}

export interface GetReady {
  /** The Recipes (and lots, places) are still loading: Cook Mode waits, it does not flash Step 1 first. */
  isLoading: boolean
  /** There is a list to show: false when a Recipe could not be read or no line came back (Cook Mode then opens on Step 1, as before). */
  available: boolean
  sections: ReadySection[]
  /** lib/ingredients readyMeta of the first Recipe's Yield and Batches. */
  meta: string
  /** "Roast chicken · 2.75 portions" (a Recipe cook: "Roast chicken · 8 portions"), the sheet's context line. */
  context: string
}

const num = (n: number) => String(Number(n.toFixed(2)))
const portionsText = (n: number) => (n === 1 ? '1 portion' : `${num(n)} portions`)

/**
 * `portions` is the Planned Meal's (null for a Recipe cook). A Stock or places failure leaves the rows without a place; a Recipe
 * failure makes the list unavailable. With no sources nothing is read.
 */
export function useGetReady(sources: GetReadySource[], portions: number | null): GetReady {
  const enabled = sources.length > 0
  const recipes = useQueries({
    queries: sources.map((s) => ({ queryKey: ['recipes', s.recipeId], queryFn: () => recipesApi.get(s.recipeId) })),
  })
  const recipesLoading = recipes.some((q) => q.isPending)
  const recipesFailed = recipes.some((q) => q.isError)
  // Where each Ingredient is kept is read once the Recipes are in (nothing of Stock is read for a list that cannot be shown).
  const placed = enabled && !recipesLoading && !recipesFailed
  const lots = useQuery({ queryKey: ['stock', 'lots', 'all'], queryFn: () => stockApi.lots(), enabled: placed })
  const places = useQuery({ queryKey: ['stock', 'places'], queryFn: () => stockApi.storagePlaces(), enabled: placed })
  const system = usePreferences(enabled).preferences.units

  const isLoading = enabled && (recipesLoading || (placed && (lots.isPending || places.isPending)))
  const data = recipes.map((q) => q.data)

  {
    const none: GetReady = { isLoading, available: false, sections: [], meta: '', context: '' }
    if (!enabled || isLoading || recipesFailed || data.some((d) => d === undefined)) return none
    const readySources: ReadySource[] = sources.map((s, i) => ({
      courseId: s.courseId,
      courseName: s.courseName,
      recipeName: s.recipeName || data[i]!.name,
      lines: data[i]!.lines ?? [],
      yield: data[i]!.yield,
      batches: s.batches,
    }))
    const sections = readySections(readySources, { system, lots: lots.data?.lots ?? [], places: places.data ?? [] })
    if (sections.length === 0) return none
    const first = readySources[0]!
    const shown = portions ?? first.batches * first.yield
    return {
      isLoading: false,
      available: true,
      sections,
      meta: readyMeta({ portions, batches: first.batches, yield: first.yield }),
      context: `${first.recipeName} · ${portionsText(shown)}`,
    }
  }
}
