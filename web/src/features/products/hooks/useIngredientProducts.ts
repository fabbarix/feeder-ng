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
  void ingredientId
  throw new Error('TODO')
}
