import type { Price, PriceBody, ProductDetail, Shop } from '../types'

export interface UseProduct {
  product: ProductDetail | undefined
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  shops: Shop[]
  /** latest Price per Shop id (from product.latestPrices) */
  latestByShop: Record<number, Price | undefined>
  rename: (name: string) => Promise<void>
  setPackSize: (size: number) => Promise<void>
  addBarcode: (raw: string) => Promise<void>
  removeBarcode: (code: string) => Promise<void>
  setSoldAt: (shopId: number, sells: boolean) => Promise<void>
  recordPrice: (body: PriceBody) => Promise<void>
  deletePrice: (priceId: number) => Promise<void>
  /** Rejects with ApiError 409 in_use when the Product was bought. */
  remove: () => Promise<void>
}

/** One Product (key ['products', id]); every mutation refreshes it and the list, and ['catalog']. */
export function useProduct(id: number): UseProduct {
  void id
  throw new Error('TODO')
}
