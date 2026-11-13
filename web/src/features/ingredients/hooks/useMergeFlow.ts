import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { ingredientsApi } from '../api'
import { type Answers, buildMergeRequest, isResolved } from '../lib/mergeResolution'
import { filterIngredients, normalizeName } from '../lib/names'
import type { Ingredient, IngredientKind, MergePreview } from '../types'
import { useIngredients } from './useIngredients'

/** Shorter queries are matched as a plain substring; longer ones go to the server's fuzzy search. */
const SEARCH_MIN_LENGTH = 3

export interface UseMergeFlow {
  query: string
  setQuery: (q: string) => void
  /** Search hits (exact first, then suggestions, else a plain filter for a short query) excluding the source itself. */
  candidates: Ingredient[]
  target: Ingredient | null
  selectTarget: (i: Ingredient | null) => void
  /** Loaded once a target is selected. */
  preview: MergePreview | undefined
  isLoading: boolean
  answers: Answers
  answer: (key: string, value: number | null) => void
  /** Preview loaded, not blocked, every conflict answered. */
  canMerge: boolean
  /**
   * POSTs the merge, then calls `onMerged` with the survivor at once (the caller navigates away from the source),
   * drops the source's cached queries, and refreshes the list without waiting for it.
   * Resolves with the surviving Ingredient.
   */
  merge: (onMerged?: (survivor: Ingredient) => void) => Promise<Ingredient>
}

/** The merge of one Ingredient into another of the same kind: candidates and search stay in `kind` (food by default). */
export function useMergeFlow(sourceId: number, kind: IngredientKind = 'food'): UseMergeFlow {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Ingredient | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const { ingredients } = useIngredients('', kind)

  const key = normalizeName(query)
  const searching = key.length >= SEARCH_MIN_LENGTH
  const search = useQuery({
    queryKey: ['ingredients', 'search', kind, key],
    queryFn: () => ingredientsApi.search(query.trim(), undefined, kind),
    enabled: searching,
  })

  const candidates = useMemo(() => {
    const pool = searching
      ? [search.data?.exact, ...(search.data?.suggestions.map((s) => s.ingredient) ?? [])].filter(
          (i): i is Ingredient => i !== undefined && i !== null,
        )
      : filterIngredients(ingredients, query)
    const seen = new Set<number>()
    return pool.filter((i) => {
      if (i.id === sourceId || seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })
  }, [searching, search.data, ingredients, query, sourceId])

  const previewQuery = useQuery({
    queryKey: ['ingredients', sourceId, 'merge-preview', target?.id],
    queryFn: () => ingredientsApi.mergePreview(sourceId, target!.id),
    enabled: target !== null,
  })
  const preview = previewQuery.data

  return {
    query,
    setQuery,
    candidates,
    target,
    selectTarget: (i) => {
      setTarget(i)
      setAnswers({})
    },
    preview,
    isLoading: previewQuery.isFetching,
    answers,
    answer: (k, value) => setAnswers((a) => ({ ...a, [k]: value })),
    canMerge: preview !== undefined && preview.blocked === '' && isResolved(preview.conflicts, answers),
    merge: async (onMerged) => {
      if (!target || !preview) throw new Error('Choose the Ingredient to keep first')
      let survivor: Ingredient
      try {
        survivor = await ingredientsApi.merge(sourceId, buildMergeRequest(target.id, preview.conflicts, answers))
      } catch (e) {
        // The server found conflicts (or a Base Unit mismatch) the preview did not show: reload it so the User sees them.
        if (e instanceof ApiError && (e.code === 'merge_conflicts' || e.code === 'base_unit_mismatch' || e.code === 'kind_differs')) {
          void client.invalidateQueries({ queryKey: ['ingredients', sourceId, 'merge-preview'] })
        }
        throw e
      }
      // Navigate first: the source screen unmounts before anything can refetch the deleted source.
      onMerged?.(survivor)
      // Drop the deleted source (its detail, merge preview and any sub-key), so nothing refetches a 404.
      client.removeQueries({ queryKey: ['ingredients', sourceId] })
      // Not awaited: nothing waits on the list refresh.
      void client.invalidateQueries({ queryKey: ['ingredients'] })
      return survivor
    },
  }
}
