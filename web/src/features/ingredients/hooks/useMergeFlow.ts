import type { Answers } from '../lib/mergeResolution'
import type { Ingredient, MergePreview } from '../types'

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
  /** POSTs the merge, refreshes caches, resolves with the surviving Ingredient. */
  merge: () => Promise<Ingredient>
}

export function useMergeFlow(sourceId: number): UseMergeFlow {
  void sourceId
  throw new Error('TODO')
}
