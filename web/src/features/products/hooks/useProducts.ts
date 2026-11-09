import { useQuery } from '@tanstack/react-query'
import { productsApi } from '../api'
import type { Product } from '../types'

export interface UseProducts {
  products: Product[]
  isLoading: boolean
  error: Error | null
}

/** All Products, filtered by name text on the server (key ['products', { q }]). */
export function useProducts(q: string): UseProducts {
  const query = useQuery({ queryKey: ['products', { q }], queryFn: () => productsApi.list({ q: q.trim() }) })
  return { products: query.data ?? [], isLoading: query.isLoading, error: query.error }
}
