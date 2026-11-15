import { useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../api'
import type { NewProduct, ProductDetail } from '../types'

/** SET-14a: creates a Product from the Products list; refreshes the Products, the Ingredients' references and the Catalog. */
export function useCreateProduct(): (body: NewProduct) => Promise<ProductDetail> {
  const client = useQueryClient()
  return async (body) => {
    const created = await productsApi.create(body)
    await Promise.all([
      client.invalidateQueries({ queryKey: ['products'] }),
      client.invalidateQueries({ queryKey: ['ingredients'] }),
      client.invalidateQueries({ queryKey: ['catalog'] }),
    ])
    return created
  }
}
