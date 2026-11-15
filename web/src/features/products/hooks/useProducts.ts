import { useQuery } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { productsApi } from '../api'
import type { Product } from '../types'

export interface UseProducts {
  /** B9-20 (RES-02): which of the seven screen states the list is in. */
  state: ScreenState
  products: Product[]
  isLoading: boolean
  error: Error | null
  /** Fetches the list again (the error state's Try again). */
  refetch: () => void
}

/** Products filtered by name text on the server (key ['products', { q, includeArchived }]). Archived Products only when asked (WP11). */
export function useProducts(q: string, includeArchived = false): UseProducts {
  const query = useQuery({
    queryKey: ['products', { q, includeArchived }],
    queryFn: () => productsApi.list({ q: q.trim(), includeArchived: includeArchived || undefined }),
  })
  const state = useScreenState(query, { isEmpty: query.data?.length === 0, hasFilter: q.trim() !== '' })
  return { state, products: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: () => void query.refetch() }
}
