import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query'
import { shopsApi } from '../../shops/api'
import type { ShopRule } from '../../shops/types'
import { productsApi } from '../api'
import type { Price, PriceBody, ProductDetail, Shop } from '../types'

export interface UseProduct {
  product: ProductDetail | undefined
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  shops: Shop[]
  /** latest Price per Shop id (from product.latestPrices) */
  latestByShop: Record<number, Price | undefined>
  /** every recorded Price, newest first */
  prices: Price[]
  rename: (name: string) => Promise<void>
  setPackSize: (size: number) => Promise<void>
  addBarcode: (raw: string) => Promise<void>
  removeBarcode: (code: string) => Promise<void>
  setSoldAt: (shopId: number, sells: boolean) => Promise<void>
  recordPrice: (body: PriceBody) => Promise<void>
  deletePrice: (priceId: number) => Promise<void>
  /** The weight rules of the Shops that hold weighed Shop Barcodes (labels name the prefix). */
  rules: ShopRule[]
  archive: () => Promise<void>
  unarchive: () => Promise<void>
  /** Rejects with ApiError 409 product_bought when the Product was bought (archive it instead). */
  remove: () => Promise<void>
}

/** One Product (key ['products', id]); every mutation refreshes it and the list, and ['catalog']. */
export function useProduct(id: number): UseProduct {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['products', id], queryFn: () => productsApi.get(id) })
  const shops = useQuery({ queryKey: ['shops'], queryFn: () => shopsApi.list() })
  const prices = useQuery({ queryKey: ['products', id, 'prices'], queryFn: () => productsApi.prices(id) })

  const weighedShopIds = [...new Set((query.data?.shopBarcodes ?? []).filter((b) => b.ruleId !== undefined).map((b) => b.shopId))]
  const ruleQueries = useQueries({
    queries: weighedShopIds.map((shopId) => ({ queryKey: ['shops', shopId, 'rules'], queryFn: () => shopsApi.rules(shopId) })),
  })
  const rules = ruleQueries.flatMap((q) => q.data ?? [])

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['products'] }),
      client.invalidateQueries({ queryKey: ['catalog'] }),
    ])
  }
  const changed = async (request: Promise<unknown>) => {
    await request
    await refresh()
  }

  const latestByShop: Record<number, Price | undefined> = {}
  for (const p of query.data?.latestPrices ?? []) latestByShop[p.shopId] = p

  return {
    product: query.data,
    isLoading: query.isLoading,
    error: query.error,
    shops: shops.data ?? [],
    latestByShop,
    prices: prices.data ?? [],
    rules,
    archive: () => changed(productsApi.archive(id)),
    unarchive: () => changed(productsApi.unarchive(id)),
    rename: (name) => changed(productsApi.patch(id, { name })),
    setPackSize: (size) => changed(productsApi.patch(id, { packSize: size })),
    addBarcode: (raw) => changed(productsApi.addBarcode(id, raw)),
    removeBarcode: (code) => changed(productsApi.removeBarcode(id, code)),
    setSoldAt: (shopId, sells) => changed(sells ? productsApi.setSoldAt(id, shopId) : productsApi.unsetSoldAt(id, shopId)),
    recordPrice: (body) => changed(productsApi.recordPrice(id, body)),
    deletePrice: (priceId) => changed(productsApi.deletePrice(priceId)),
    remove: async () => {
      await productsApi.remove(id)
      client.removeQueries({ queryKey: ['products', id] })
      await refresh()
    },
  }
}
