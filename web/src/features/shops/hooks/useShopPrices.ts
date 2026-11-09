import { useQueries } from '@tanstack/react-query'
import { productsApi } from '../../products/api'
import type { Price } from '../../products/types'

/** The latest Price at this Shop of each given Product (those with none are left out). */
export function useShopPrices(shopId: number, productIds: number[]): Price[] {
  const results = useQueries({
    queries: productIds.map((pid) => ({
      queryKey: ['products', pid, 'latest-price', shopId],
      queryFn: () => productsApi.latestPrice(pid, shopId),
    })),
  })
  return results.flatMap((r) => (r.data && r.data.shopId === shopId ? [r.data] : []))
}
