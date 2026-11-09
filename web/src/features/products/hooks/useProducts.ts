import type { Product } from '../types'

export interface UseProducts {
  products: Product[]
  isLoading: boolean
  error: Error | null
}

/** All Products, filtered by name text on the server (key ['products', { q }]). */
export function useProducts(q: string): UseProducts {
  void q
  throw new Error('TODO')
}
