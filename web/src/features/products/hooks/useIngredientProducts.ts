import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../api'
import type { NewProduct, Product, ProductDetail } from '../types'

export interface UseIngredientProducts {
  products: Product[]
  isLoading: boolean
  error: Error | null
  /** Creates a Product; refreshes ['products'] and the Ingredient's references. Rejects with ApiError. */
  create: (body: NewProduct) => Promise<ProductDetail>
}

/** The Products of one Ingredient (react-query key ['products', { ingredient: id }]). */
export function useIngredientProducts(ingredientId: number): UseIngredientProducts {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['products', { ingredient: ingredientId }],
    queryFn: () => productsApi.list({ ingredient: ingredientId }),
  })
  const create = useMutation({
    mutationFn: (body: NewProduct) => productsApi.create(body),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['products'] }),
        client.invalidateQueries({ queryKey: ['ingredients'] }),
        client.invalidateQueries({ queryKey: ['catalog'] }),
      ])
    },
  })
  return {
    products: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: (body) => create.mutateAsync(body),
  }
}
