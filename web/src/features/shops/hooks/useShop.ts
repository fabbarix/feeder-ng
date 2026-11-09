import type { RuleBody } from '../api'
import type { Shop, ShopBarcode, ShopRule } from '../types'

export interface UseShop {
  shop: Shop | undefined
  rules: ShopRule[]
  barcodes: ShopBarcode[]
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  rename: (name: string) => Promise<void>
  remove: () => Promise<void>
  addRule: (body: RuleBody) => Promise<void>
  updateRule: (id: number, body: RuleBody) => Promise<void>
  deleteRule: (id: number) => Promise<void>
  deleteBarcode: (id: number) => Promise<void>
}

/** One Shop with its rules and Shop Barcodes (keys ['shops', id, ...]); every mutation refreshes them and ['catalog']. */
export function useShop(id: number): UseShop {
  void id
  throw new Error('TODO')
}
