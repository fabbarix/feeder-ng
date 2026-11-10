import { useQuery } from '@tanstack/react-query'
import { productsApi } from '../api'
import type { Product } from '../types'

export interface UseProducts {
  products: Product[]
  isLoading: boolean
  error: Error | null
}

/** Products filtered by name text on the server (key ['products', { q, includeArchived }]). Archived Products only when asked (WP11). */
export function useProducts(q: string, includeArchived = false): UseProducts {
  const query = useQuery({
    queryKey: ['products', { q, includeArchived }],
    queryFn: () => productsApi.list({ q: q.trim(), includeArchived: includeArchived || undefined }),
  })
  return { products: query.data ?? [], isLoading: query.isLoading, error: query.error }
}
